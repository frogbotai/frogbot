import type { Gateway } from '@frogbotai/gateway';
import type {
  AgentCallParameters,
  AgentStreamParameters,
  ModelMessage,
  TextStreamPart,
  UIMessage,
} from 'ai';
import { generateId, ToolLoopAgent } from 'ai';

import { toHookUsage } from '../ai/hooks.js';
import { logUsage } from '../ai/logUsage.js';
import { resolveModelInputs } from '../ai/modelInputs.js';
import { resolveModel } from '../ai/resolve.js';
import type { SanitizedAIConfig } from '../ai/types.js';
import { resolveChatContext } from '../chat/chatContext.js';
import { generateMessage } from '../chat/generateMessage.js';
import { persistAssistantMessage } from '../chat/messagePersistence.js';
import { actorFromRequest } from '../chat/turn/actor.js';
import { repairInterruptedParts } from '../chat/turn/messages.js';
import { promoteQueuedMessage, promoteSteerMessages } from '../chat/turn/queue.js';
import { assertStoredSelection } from '../chat/turn/selection.js';
import { holdTurn, releaseTurn } from '../chat/turn/state.js';
import { streamTurn } from '../chat/turn/streamTurn.js';
import { validateChatMessages } from '../chat/validateMessages.js';
import type { FrogBot } from '../frogbot.js';
import type { ToolCtx } from '../tools/types.js';
import { isClientTool } from '../tools/types.js';
import type { FrogBotRequest } from '../types/request.js';
import { toAgentModelMessages } from '../uploads/toAgentModelMessages.js';
import type { AttachmentHashes } from '../uploads/toModelInput.js';
import { toModelInput } from '../uploads/toModelInput.js';
import type { ResolvedAgentSelection } from './service.js';
import { userDefaultModel } from './service.js';
import { toAISDKTools, toAISDKToolsContext } from './tools.js';
import type {
  AgentCallOptions,
  AgentGenerateOpts,
  AgentGenerateResult,
  AgentInstance,
  AgentStreamMessageOpts,
  AgentStreamMessageQueuedResult,
  AgentStreamMessageResult,
  AgentStreamOpts,
  AgentStreamResult,
  SanitizedAgentConfig,
} from './types.js';

export type AgentInstanceDeps = {
  gateway: Gateway;
  config: SanitizedAIConfig;
  frogbot: FrogBot;
};

type AgentRun = {
  selection: ResolvedAgentSelection;
  models: string[];
  hashes: AttachmentHashes;
};

export function createAgentInstance(
  agentConfig: SanitizedAgentConfig,
  deps: AgentInstanceDeps,
): AgentInstance {
  const { gateway, config, frogbot } = deps;
  const clientTools = (agentConfig.tools ?? []).filter(isClientTool);
  const clientToolSlugs = new Set(clientTools.map(({ slug }) => slug));
  const clientSteps = new WeakSet<ModelMessage[]>();
  const tools = toAISDKTools(agentConfig.tools, {
    skip: (messages) => clientSteps.has(messages),
  });

  const access = agentConfig.access ?? (({ req }) => !!req.user);
  const runs = new WeakMap<AgentCallOptions, AgentRun>();
  let instance: AgentInstance;

  const baseAgent = new ToolLoopAgent<AgentCallOptions, typeof tools, Record<string, unknown>>({
    id: agentConfig.slug,
    model: gateway.chatModel(resolveModel(agentConfig.model.default, config)),
    instructions: agentConfig.instructions,
    tools,
    stopWhen: agentConfig.stopWhen,
    prepareCall: ({ options, ...call }) => {
      const ctx: ToolCtx = {
        req: options.req!,
        frogbot,
        agent: {
          slug: agentConfig.slug,
          runId: options.runId!,
          chatId: options.chatId,
        },
      };

      const kinds = new Set(options.clientTools?.kinds ?? []);
      const req = options.req!;
      const chatId = options.chatId;
      const run = runs.get(options)!;

      return {
        ...call,
        model: gateway.chatModel(run.selection.model),
        runtimeContext: { agent: ctx.agent },
        toolsContext: toAISDKToolsContext(agentConfig.tools, ctx),
        ...(clientTools.length === 0
          ? {}
          : {
              activeTools: (agentConfig.tools ?? [])
                .filter((tool) => !isClientTool(tool) || kinds.has(tool.client.kind))
                .map(({ slug }) => slug),
              toolApproval: ({ toolCall, messages }) => {
                if (clientToolSlugs.has(toolCall.toolName)) clientSteps.add(messages);

                return 'not-applicable';
              },
            }),
        prepareStep: async ({ messages, stepNumber }) => {
          const steered =
            chatId === undefined
              ? []
              : await promoteSteerMessages({
                  req,
                  chatId,
                  before: options.replyCreatedAt,
                  actor: actorFromRequest(req),
                });

          const governing = steered.at(-1);

          if (governing) {
            run.selection = assertStoredSelection({
              agent: instance,
              config,
              selection: governing.selection,
              user: req.user,
            });
          }

          run.models[stepNumber] = run.selection.model;

          const { model, variant } = run.selection;

          const steeredMessages =
            steered.length === 0
              ? []
              : await toAgentModelMessages({
                  req,
                  messages: steered.map(({ message }) => message),
                  chatId,
                  model,
                  tools,
                  onUnavailable: 'marker',
                });

          const { inputs, provider } = resolveModelInputs({ config, model });

          return {
            model: gateway.chatModel(model),
            ...(variant ? { providerOptions: variant.providerOptions } : {}),
            messages: toModelInput({
              messages: steeredMessages.length === 0 ? messages : [...messages, ...steeredMessages],
              inputs,
              provider,
              hashes: run.hashes,
            }),
          };
        },
      };
    },
  });

  type Call = AgentCallParameters<AgentCallOptions, typeof tools, Record<string, unknown>>;
  type StreamCall = AgentStreamParameters<AgentCallOptions, typeof tools, Record<string, unknown>>;

  const buildPrompt = async (
    opts: AgentStreamOpts &
      Pick<AgentCallOptions, 'chatId' | 'selection'> & { req: FrogBotRequest },
  ): Promise<{ prompt: string } | { messages: ModelMessage[] }> => {
    if ('prompt' in opts && opts.prompt !== undefined) return { prompt: opts.prompt };

    const messages = opts.messages ?? [];

    if (!messages.some((message) => 'parts' in message)) {
      return { messages: messages as ModelMessage[] };
    }

    const { model } = assertStoredSelection({
      agent: instance,
      config,
      selection: opts.selection ?? {},
      user: opts.req.user,
    });

    return {
      messages: await toAgentModelMessages({
        req: opts.req,
        messages: messages as UIMessage[],
        chatId: opts.chatId,
        model,
        tools,
        onUnavailable: 'marker',
      }),
    };
  };

  const buildCall = async (
    opts: AgentStreamOpts & Pick<AgentCallOptions, 'chatId' | 'selection'>,
  ) => {
    const req = await frogbot.createRequest(opts.req);

    return {
      ...(await buildPrompt({ ...opts, req })),
      options: {
        req,
        overrideAccess: opts.overrideAccess ?? true,
        ...('chatId' in opts && opts.chatId !== undefined ? { chatId: opts.chatId } : {}),
        ...(opts.selection ? { selection: opts.selection } : {}),
      },
      abortSignal: opts.abortSignal,
    };
  };

  const prepareRun = async <T extends Call>(call: T) => {
    const options = call.options;
    const req = await frogbot.createRequest(options.req);
    const overrideAccess = options.overrideAccess ?? true;
    if (!overrideAccess && !(await access({ req, agent: instance }))) {
      throw Object.assign(new Error(`Access denied for agent '${agentConfig.slug}'`), {
        status: 403,
      });
    }

    const selection = assertStoredSelection({
      agent: instance,
      config,
      selection: options.selection ?? {},
      user: req.user,
    });

    const runId = options.runId ?? generateId();
    const preparedOptions = { ...options, req, overrideAccess, runId };
    const run: AgentRun = { selection, models: [], hashes: new Map() };

    runs.set(preparedOptions, run);

    return {
      req,
      runId,
      run,
      call: { ...call, options: preparedOptions },
    };
  };

  const finishSteps = async (
    steps: readonly { finishReason?: string; usage?: unknown }[],
    context: {
      req: FrogBotRequest;
      runId: string;
      chatId?: number | string;
      model: string;
      models: readonly string[];
    },
  ) => {
    for (const [index, step] of steps.entries()) {
      const model = context.models[index] ?? context.model;

      await logUsage({
        phase: 'afterOperation',
        operation: 'chat.completions',
        requestId: `req_${crypto.randomUUID()}`,
        startedAt: Date.now(),
        context: {
          req: context.req,
          agent: {
            slug: agentConfig.slug,
            runId: context.runId,
            chatId: context.chatId,
          },
        },
        otel: {},
        model,
        provider: model.slice(0, model.indexOf('/')),
        finishReason: step.finishReason,
        usage: toHookUsage(step.usage),
        durationMs: 0,
      });
    }
  };

  const runGenerate = async (call: Call): Promise<AgentGenerateResult> => {
    const { req, runId, run, call: preparedCall } = await prepareRun(call);
    const model = run.selection.model;
    // Op-model-join NOT taken: the agent's chat model is fixed at construction and
    // re-set per call inside `prepareCall`, which has no access to the op. The AI SDK's
    // `AgentCallParameters` (what `baseAgent.generate` accepts) carries no `model` field,
    // so `preparedCall.model = op.chatModel()` would be ignored — model overrides only
    // flow through the `prepareCall` and `prepareStep` returns. Injecting a per-op model via
    // a shared closure variable would race across concurrent invocations. So upstream calls use
    // `gateway.chatModel(...)` (upstream hooks mint their own requestId), and the op only
    // drives beforeOperation (start) / afterOperation (finish).
    const op = gateway.operation({
      operation: 'chat.completions',
      model,
      context: {
        req,
        agent: {
          slug: agentConfig.slug,
          runId,
          chatId: preparedCall.options.chatId,
        },
        trackUsage: false,
      },
    });

    await op.start();

    try {
      const result = await baseAgent.generate(preparedCall);

      await finishSteps(result.steps, {
        req,
        runId,
        chatId: preparedCall.options.chatId,
        model,
        models: run.models,
      });

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
    const { req, runId, run, call: preparedCall } = await prepareRun(call);
    const model = run.selection.model;
    const op = gateway.operation({
      operation: 'chat.completions',
      model,
      context: {
        req,
        agent: {
          slug: agentConfig.slug,
          runId,
          chatId: preparedCall.options.chatId,
        },
        trackUsage: false,
      },
    });

    const userEnd = call.onEnd ?? call.onFinish;
    const finishOperation = (() => {
      let promise: Promise<void> | undefined;

      return (result?: {
        finishReason?: string;
        usage?: ReturnType<typeof toHookUsage>;
        error?: unknown;
      }) => (promise ??= op.finish(result));
    })();

    const abortSignal = preparedCall.abortSignal;
    const finishAbort = () => {
      void finishOperation({
        finishReason: 'abort',
        error: abortSignal?.reason,
      }).catch((error: unknown) => {
        frogbot.logger.error({ error }, '[frogbot] Failed to finalize aborted agent stream.');
      });
    };

    const transforms = call.experimental_transform;

    await op.start();

    if (abortSignal?.aborted) {
      finishAbort();
    } else {
      abortSignal?.addEventListener('abort', finishAbort, { once: true });
    }

    try {
      return await baseAgent.stream({
        ...preparedCall,
        experimental_transform: [
          ...(Array.isArray(transforms) ? transforms : transforms ? [transforms] : []),
          () =>
            new TransformStream<TextStreamPart<typeof tools>, TextStreamPart<typeof tools>>({
              async transform(part, controller) {
                if (part.type === 'error') {
                  abortSignal?.removeEventListener('abort', finishAbort);

                  await finishOperation({ error: part.error });
                }

                controller.enqueue(part);
              },
            }),
        ],
        onEnd: async (event) => {
          abortSignal?.removeEventListener('abort', finishAbort);

          await finishSteps(event.steps ?? [], {
            req,
            runId,
            chatId: preparedCall.options.chatId,
            model,
            models: run.models,
          });

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
    const { chatId, ...runOpts } = opts;
    const req = await frogbot.createRequest(runOpts.req);

    if (runOpts.overrideAccess === false && !(await access({ req, agent: instance }))) {
      throw Object.assign(new Error(`Access denied for agent '${agentConfig.slug}'`), {
        status: 403,
      });
    }

    const incoming = await toPersistentMessages(runOpts, tools);

    const context = await resolveChatContext({
      req,
      agentSlug: agentConfig.slug,
      chatId,
      incoming,
      tools,
      queue: false,
    });

    if (context.status !== 'ready') {
      throw new Error(`[frogbot] Chat '${context.chatId}' could not start a turn.`);
    }

    const { claim, uiMessages, selection } = context;
    const lease = holdTurn({ req, claim });

    try {
      const result = await aiAgent.generate(
        await buildCall({
          messages: uiMessages,
          req,
          overrideAccess: true,
          chatId: context.chatId,
          selection,
          abortSignal: AbortSignal.any([
            lease.signal,
            ...(runOpts.abortSignal ? [runOpts.abortSignal] : []),
          ]),
        }),
      );

      const model = selection.model ?? userDefaultModel({ agent: instance, user: req.user });

      if (model === undefined) {
        throw new Error(
          `[frogbot] Agent '${agentConfig.slug}' has no validated model for this user.`,
        );
      }

      const mainModel = resolveModel(model, config);

      const message = await generateMessage({
        result,
        originalMessages: uiMessages,
        tools,
        model: mainModel,
      });

      await persistAssistantMessage({
        req,
        chatId: context.chatId,
        message: { ...message, parts: repairInterruptedParts(message.parts) },
        history: uiMessages,
        mainModel,
      });

      return result;
    } finally {
      lease.stop();

      if (await releaseTurn({ req, claim, state: 'idle' })) {
        await promoteQueuedMessage({ req, chatId: context.chatId });
      }
    }
  };

  const stream = async (opts: AgentStreamOpts): Promise<AgentStreamResult> =>
    aiAgent.stream(await buildCall(opts));

  const streamMessage = async (
    opts: AgentStreamMessageOpts,
  ): Promise<AgentStreamMessageResult | AgentStreamMessageQueuedResult> => {
    const { chatId, channelAccess, clientTools, delivery, ...runOpts } = opts;
    const req = await frogbot.createRequest(runOpts.req);

    if (runOpts.overrideAccess === false && !(await access({ req, agent: instance }))) {
      throw Object.assign(new Error(`Access denied for agent '${agentConfig.slug}'`), {
        status: 403,
      });
    }

    runOpts.abortSignal?.throwIfAborted();

    const incoming = await toPersistentMessages(runOpts, tools);

    const context = await resolveChatContext({
      req,
      agentSlug: agentConfig.slug,
      chatId,
      incoming,
      tools,
      channelAccess,
      delivery,
    });

    if (context.status === 'queued') return context;

    const turn = await streamTurn({
      req,
      agent: instance,
      claim: context.claim,
      uiMessages: context.uiMessages,
      selection: context.selection,
      clientTools,
      abortSignal: runOpts.abortSignal,
      onError: (error) => {
        throw error;
      },
    });

    return Object.assign(turn.result, {
      chatId: context.chatId,
      uiMessageStream: turn.uiMessageStream,
      persistence: turn.persistence,
    });
  };

  instance = {
    slug: agentConfig.slug,
    config: agentConfig,
    aiAgent,
    generate,
    stream,
    streamMessage,
  };

  return instance;
}

async function toPersistentMessages(
  opts: AgentStreamOpts,
  tools: ReturnType<typeof toAISDKTools>,
): Promise<UIMessage[]> {
  if ('prompt' in opts && opts.prompt !== undefined) {
    return [
      {
        id: generateId(),
        role: 'user',
        parts: [{ type: 'text', text: opts.prompt }],
      },
    ];
  }

  const messages = opts.messages ?? [];
  if (messages.some((message) => !('parts' in message))) {
    throw Object.assign(new Error('Chat persistence requires UI messages'), {
      status: 400,
    });
  }

  return validateChatMessages(messages, tools);
}
