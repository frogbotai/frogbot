import { ToolLoopAgent, convertToModelMessages, generateId, validateUIMessages } from 'ai';
import type { AgentCallParameters, AgentStreamParameters, UIMessage } from 'ai';
import type { Gateway } from '@frogbotai/gateway';

import { toHookUsage } from '../ai/hooks.js';
import { resolveModel } from '../ai/resolve.js';
import { generateMessage } from '../chat/generateMessage.js';
import { persistAssistantMessage } from '../chat/messagePersistence.js';
import { resolveThreadContext } from '../chat/threadContext.js';
import type { Frogbot } from '../frogbot.js';
import type {
  AgentCallOptions,
  AgentConfig,
  AgentGenerateOpts,
  AgentGenerateResult,
  AgentStreamOpts,
  AgentStreamResult,
  AgentInstance,
} from '../types/agent.js';
import type { SanitizedAIConfig } from '../types/ai.js';
import type { ToolCtx } from '../types/tool.js';
import { toAISDKTools, toAISDKToolsContext } from './tools.js';

export type AgentInstanceDeps = {
  gateway: Gateway;
  config: SanitizedAIConfig;
  frogbot: Frogbot;
};

export function createAgentInstance(agentConfig: AgentConfig, deps: AgentInstanceDeps): AgentInstance {
  const { gateway, config, frogbot } = deps;
  const tools = toAISDKTools(agentConfig.tools);
  const access = agentConfig.access ?? (({ req }) => !!req.user);

  const baseAgent = new ToolLoopAgent<AgentCallOptions, typeof tools, Record<string, unknown>>({
    id: agentConfig.slug,
    model: gateway.chatModel(resolveModel(agentConfig.model, config)),
    instructions: agentConfig.instructions,
    tools,
    stopWhen: agentConfig.stopWhen,
    prepareCall: ({ options, ...call }) => {
      const ctx: ToolCtx = {
        req: options.req!,
        frogbot,
        agent: { slug: agentConfig.slug, runId: options.runId! },
      };

      return {
        ...call,
        model: gateway.chatModel(resolveModel(agentConfig.model, config)),
        runtimeContext: { agent: ctx.agent },
        toolsContext: toAISDKToolsContext(agentConfig.tools, ctx),
      };
    },
  });

  type Call = AgentCallParameters<AgentCallOptions, typeof tools, Record<string, unknown>>;
  type StreamCall = AgentStreamParameters<AgentCallOptions, typeof tools, Record<string, unknown>>;

  const buildCall = async (opts: AgentStreamOpts) => ({
    ...(await buildPrompt(opts, tools)),
    options: {
      req: opts.req,
      overrideAccess: opts.overrideAccess ?? true,
    },
    abortSignal: opts.abortSignal,
  });

  const prepareRun = async <T extends Call>(call: T) => {
    const options = call.options;
    const req = await frogbot.createRequest(options.req);
    const overrideAccess = options.overrideAccess ?? true;
    if (!overrideAccess && !(await access({ req }))) {
      throw Object.assign(new Error(`Access denied for agent '${agentConfig.slug}'`), { status: 403 });
    }
    const runId = options.runId ?? generateId();
    return {
      req,
      runId,
      call: { ...call, options: { ...options, req, overrideAccess, runId } },
    };
  };

  const runGenerate = async (call: Call): Promise<AgentGenerateResult> => {
    const { req, runId, call: preparedCall } = await prepareRun(call);
    // Op-model-join NOT taken: the agent's chat model is fixed at construction and
    // re-set per call inside `prepareCall`, which has no access to the op. The AI SDK's
    // `AgentCallParameters` (what `baseAgent.generate` accepts) carries no `model` field,
    // so `preparedCall.model = op.chatModel()` would be ignored — model overrides only
    // flow through `prepareCall`'s return. Injecting a per-op model via a shared closure
    // variable would race across concurrent invocations. So upstream calls use
    // `gateway.chatModel(...)` (upstream hooks mint their own requestId), and the op only
    // drives beforeOperation (start) / afterOperation (finish).
    const op = gateway.operation({
      operation: 'chat.completions',
      model: resolveModel(agentConfig.model, config),
      context: { req, agent: { slug: agentConfig.slug, runId } },
    });
    await op.start();

    try {
      const result = await baseAgent.generate(preparedCall);
      await op.finish({
        finishReason: result.finishReason,
        usage: toHookUsage(result.usage),
      });
      return result;
    } catch (error) {
      await op.finish({ error });
      throw error;
    }
  };

  const runStream = async (call: StreamCall): Promise<AgentStreamResult> => {
    const { req, runId, call: preparedCall } = await prepareRun(call);
    const op = gateway.operation({
      operation: 'chat.completions',
      model: resolveModel(agentConfig.model, config),
      context: { req, agent: { slug: agentConfig.slug, runId } },
    });
    const userEnd = call.onEnd ?? call.onFinish;
    const finishOperation = (() => {
      let promise: Promise<void> | undefined;
      return (result?: { finishReason?: string; usage?: ReturnType<typeof toHookUsage>; error?: unknown }) =>
        (promise ??= op.finish(result));
    })();
    const abortSignal = preparedCall.abortSignal;
    const finishAbort = () => {
      void finishOperation({ finishReason: 'abort', error: abortSignal?.reason });
    };
    await op.start();
    if (abortSignal?.aborted) finishAbort();
    else abortSignal?.addEventListener('abort', finishAbort, { once: true });

    try {
      return await baseAgent.stream({
        ...preparedCall,
        onEnd: async (event) => {
          abortSignal?.removeEventListener('abort', finishAbort);
          await finishOperation({
            finishReason: event.finishReason,
            usage: toHookUsage(event.usage),
          });
          if (userEnd) {
            await userEnd(event);
          }
        },
      });
    } catch (error) {
      abortSignal?.removeEventListener('abort', finishAbort);
      await finishOperation({ error });
      throw error;
    }
  };

  const aiAgent = {
    version: 'agent-v1' as const,
    id: agentConfig.slug,
    tools,
    generate: runGenerate,
    stream: runStream,
  } as AgentInstance['aiAgent'];

  const generate = async (opts: AgentGenerateOpts): Promise<AgentGenerateResult> => {
    const { threadId, ...runOpts } = opts;
    if (threadId === undefined) return aiAgent.generate(await buildCall(runOpts));

    const req = await frogbot.createRequest(runOpts.req);
    if (!req.user) throw Object.assign(new Error('Authentication required to use threads'), { status: 401 });
    if (runOpts.overrideAccess === false && !(await access({ req }))) {
      throw Object.assign(new Error(`Access denied for agent '${agentConfig.slug}'`), { status: 403 });
    }
    const incoming = await toPersistentMessages(runOpts, tools);
    const context = await resolveThreadContext({
      req,
      agentSlug: agentConfig.slug,
      threadId,
      incoming,
      tools,
    });
    const result = await aiAgent.generate(
      await buildCall({
        messages: context.uiMessages,
        req,
        overrideAccess: true,
        abortSignal: runOpts.abortSignal,
      }),
    );
    const message = await generateMessage({
      result,
      originalMessages: context.uiMessages,
      tools,
      model: resolveModel(agentConfig.model, config),
    });
    await persistAssistantMessage({ req, threadId, message, isContinuation: false });
    return result;
  };

  const stream = async (opts: AgentStreamOpts): Promise<AgentStreamResult> => aiAgent.stream(await buildCall(opts));

  return {
    slug: agentConfig.slug,
    config: agentConfig,
    aiAgent,
    generate,
    stream,
  };
}

async function buildPrompt(
  opts: AgentStreamOpts,
  tools: ReturnType<typeof toAISDKTools>,
): Promise<{ prompt: string } | { messages: Awaited<ReturnType<typeof convertToModelMessages>> }> {
  if ('prompt' in opts && opts.prompt !== undefined) return { prompt: opts.prompt };

  const messages = opts.messages ?? [];
  if (messages.some((message) => 'parts' in message)) {
    return {
      messages: await convertToModelMessages(messages as never[], { tools }),
    };
  }

  return {
    messages: messages as Awaited<ReturnType<typeof convertToModelMessages>>,
  };
}

async function toPersistentMessages(
  opts: AgentStreamOpts,
  tools: ReturnType<typeof toAISDKTools>,
): Promise<UIMessage[]> {
  if ('prompt' in opts && opts.prompt !== undefined) {
    return [{ id: generateId(), role: 'user', parts: [{ type: 'text', text: opts.prompt }] }];
  }

  const messages = opts.messages ?? [];
  if (messages.some((message) => !('parts' in message))) {
    throw Object.assign(new Error('Thread persistence requires UI messages'), { status: 400 });
  }
  return validateUIMessages({ messages, tools: tools as never });
}
