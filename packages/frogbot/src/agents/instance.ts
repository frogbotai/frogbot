import type { Gateway, GatewayOperation } from '@frogbotai/gateway';
import type {
  AgentCallParameters,
  AgentStreamParameters,
  ModelMessage,
  TextStreamPart,
  ToolLoopAgentSettings,
  ToolSet,
  UIMessage,
} from 'ai';
import { generateId, ToolLoopAgent, wrapLanguageModel } from 'ai';

import { toHookUsage } from '../ai/hooks.js';
import { logUsage } from '../ai/logUsage.js';
import { resolveModelInputs } from '../ai/modelInputs.js';
import { resolveModel } from '../ai/resolve.js';
import type { AIOutput, SanitizedAIConfig } from '../ai/types.js';
import { resolveChatContext } from '../chat/chatContext.js';
import { toCompactedModelMessages } from '../chat/compaction/history.js';
import type { CompactionRun } from '../chat/compaction/run.js';
import { compactionStep, createCompactionRun, overflowRetry } from '../chat/compaction/run.js';
import type { CompactionParts } from '../chat/compaction/stream.js';
import { createCompactionParts } from '../chat/compaction/stream.js';
import { generateMessage } from '../chat/generateMessage.js';
import { persistAssistantMessage } from '../chat/messagePersistence.js';
import { actorFromRequest } from '../chat/turn/actor.js';
import { messagesConfig, repairInterruptedParts } from '../chat/turn/messages.js';
import { promoteQueuedMessage, promoteSteerMessages } from '../chat/turn/queue.js';
import { assertStoredSelection } from '../chat/turn/selection.js';
import { holdTurn, releaseTurn } from '../chat/turn/state.js';
import { streamTurn } from '../chat/turn/streamTurn.js';
import { validateChatMessages } from '../chat/validateMessages.js';
import type { FrogBot } from '../frogbot.js';
import type { MCPConnections } from '../mcp/connections.js';
import { resolveMCPTools } from '../mcp/tools.js';
import { canUseTool, NO_TOOL_ACCESS } from '../tools/access.js';
import type { ToolApprovalOption } from '../tools/approval.js';
import { resolveToolApproval, toApprovalStatus } from '../tools/approval.js';
import type { ToolCtx } from '../tools/types.js';
import { isClientTool } from '../tools/types.js';
import type { FrogBotRequest } from '../types/request.js';
import { toAgentModelMessages } from '../uploads/toAgentModelMessages.js';
import type { AttachmentHashes } from '../uploads/toModelInput.js';
import { toModelInput } from '../uploads/toModelInput.js';
import { resolveAgentInstructions } from './instructions.js';
import type { ResolvedAgentSelection } from './service.js';
import {
  assertAgentAccess,
  isAgentAccessChecked,
  userDefaultModel,
  withAgentAccessChecked,
} from './service.js';
import { toAISDKTools, toAISDKToolsContext } from './tools.js';
import type {
  AgentCallOptions,
  AgentGenerateOpts,
  AgentGenerateResult,
  AgentInstance,
  AgentSelection,
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
  mcp: MCPConnections;
};

type AgentRun = {
  op: GatewayOperation;
  selection: ResolvedAgentSelection;
  models: string[];
  hashes: AttachmentHashes;
  mcpTools: ToolSet;
  mcpApprovals: ReadonlyMap<string, ToolApprovalOption>;
  autoApprove: boolean;
  denied: ReadonlySet<string>;
  compaction?: CompactionRun;
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

  const mcpServers = agentConfig.mcp ?? [];
  const toolSlugs = new Set(Object.keys(tools));
  const approvals = new Map(
    (agentConfig.tools ?? []).flatMap((tool) =>
      !isClientTool(tool) && tool.approval !== undefined && tool.approval !== false
        ? [[tool.slug, tool.approval] as const]
        : [],
    ),
  );

  const asks = approvals.size > 0 || mcpServers.some((server) => server.tools !== undefined);

  const guardedTools = (agentConfig.tools ?? []).filter(
    (tool) => !isClientTool(tool) && tool.access !== undefined,
  );

  const deniedTools = async ({ req, agent }: { req: FrogBotRequest; agent: ToolCtx['agent'] }) => {
    const allowed = await Promise.all(
      guardedTools.map((tool) => canUseTool({ tool, req, agent, logger: frogbot.logger })),
    );

    return new Set(guardedTools.filter((_, index) => !allowed[index]).map(({ slug }) => slug));
  };

  const runs = new WeakMap<AgentCallOptions, AgentRun>();
  let instance: AgentInstance;

  const agentSettings = <O extends AIOutput = never>(
    output?: O,
  ): ToolLoopAgentSettings<AgentCallOptions, typeof tools, Record<string, unknown>, O> => ({
    id: agentConfig.slug,
    model: gateway.chatModel(resolveModel(agentConfig.model.default, config)),
    tools,
    stopWhen: agentConfig.stopWhen,
    ...(output === undefined ? {} : { output }),
    prepareCall: async ({ options, ...call }) => {
      const ctx: ToolCtx = {
        req: options.req!,
        frogbot,
        agent: {
          slug: agentConfig.slug,
          runId: options.runId!,
          chatId: options.chatId,
        },
        overrideAccess: options.overrideAccess === true,
      };

      const kinds = new Set(options.clientTools?.kinds ?? []);
      const req = options.req!;
      const chatId = options.chatId;
      const run = runs.get(options)!;

      const mcpToolNames = Object.keys(run.mcpTools);
      const instructions = await resolveAgentInstructions(agentConfig, req);

      return {
        ...call,
        instructions,
        model: run.op.chatModel(run.selection.model),
        runtimeContext: { agent: ctx.agent },
        ...(mcpToolNames.length === 0 ? {} : { tools: { ...tools, ...run.mcpTools } }),
        toolsContext: toAISDKToolsContext(agentConfig.tools, ctx),
        ...(clientTools.length === 0 && run.denied.size === 0
          ? {}
          : {
              activeTools: [
                ...(agentConfig.tools ?? [])
                  .filter((tool) =>
                    isClientTool(tool) ? kinds.has(tool.client.kind) : !run.denied.has(tool.slug),
                  )
                  .map(({ slug }) => slug),
                ...mcpToolNames,
              ],
            }),
        toolApproval: async ({ toolCall, messages }) => {
          if (clientToolSlugs.has(toolCall.toolName)) clientSteps.add(messages);

          if (run.denied.has(toolCall.toolName)) return { type: 'denied', reason: NO_TOOL_ACCESS };

          const approval =
            approvals.get(toolCall.toolName) ?? run.mcpApprovals.get(toolCall.toolName);

          if (approval === undefined) return { type: 'not-applicable' };

          const resolved = await resolveToolApproval({
            approval,
            input: toolCall.input,
            req,
            agent: ctx.agent,
            tool: { slug: toolCall.toolName },
            logger: frogbot.logger,
          });

          return toApprovalStatus({
            ...resolved,
            autoApprove: run.autoApprove,
            canAsk: options.clientTools?.approval === true,
          });
        },
        prepareStep: async ({ messages, stepNumber, steps = [], initialMessages = messages }) => {
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
            run.selection = await assertStoredSelection({
              agent: instance,
              config,
              selection: governing.selection,
              req,
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
          const shape = (stepMessages: ModelMessage[]) =>
            toModelInput({ messages: stepMessages, inputs, provider, hashes: run.hashes });

          const stepMessages = run.compaction
            ? await compactionStep({
                run: run.compaction,
                messages,
                initialMessages,
                steps,
                stepNumber,
                model,
                steered: steeredMessages,
                shape,
              })
            : steeredMessages.length === 0
              ? messages
              : [...messages, ...steeredMessages];

          const stepModel = run.op.chatModel(model);

          return {
            model:
              run.compaction && config.compaction.auto
                ? wrapLanguageModel({ model: stepModel, middleware: overflowRetry(run.compaction) })
                : stepModel,
            ...(variant ? { providerOptions: variant.providerOptions } : {}),
            messages: shape(stepMessages),
          };
        },
      };
    },
  });

  const baseAgent = new ToolLoopAgent(agentSettings());

  const agentFor = <O extends AIOutput>(
    output?: O,
  ): ToolLoopAgent<AgentCallOptions, typeof tools, Record<string, unknown>, O> =>
    output === undefined ? baseAgent : new ToolLoopAgent(agentSettings(output));

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

    const { model } = await assertStoredSelection({
      agent: instance,
      config,
      selection: opts.selection ?? {},
      req: opts.req,
    });

    const props = {
      req: opts.req,
      messages: messages as UIMessage[],
      chatId: opts.chatId,
      model,
      tools,
      onUnavailable: 'marker' as const,
    };

    return {
      messages: await (opts.chatId === undefined
        ? toAgentModelMessages(props)
        : toCompactedModelMessages(props)),
    };
  };

  const buildCall = async (
    opts: AgentStreamOpts & Pick<AgentCallOptions, 'chatId' | 'selection' | 'compaction'>,
    { accessChecked = false }: { accessChecked?: boolean } = {},
  ) => {
    const req = await frogbot.createRequest(opts.req);
    const options: AgentCallOptions = {
      req,
      overrideAccess: opts.overrideAccess === true,
      ...('chatId' in opts && opts.chatId !== undefined ? { chatId: opts.chatId } : {}),
      ...(opts.selection ? { selection: opts.selection } : {}),
      ...(opts.compaction ? { compaction: opts.compaction } : {}),
      ...(opts.autoApprove === undefined ? {} : { autoApprove: opts.autoApprove }),
    };

    return {
      ...(await buildPrompt({ ...opts, req })),
      options: accessChecked ? withAgentAccessChecked(options) : options,
      abortSignal: opts.abortSignal,
    };
  };

  const prepareRun = async <T extends Call>(call: T) => {
    const options = call.options;
    const req = await frogbot.createRequest(options.req);
    const overrideAccess = options.overrideAccess === true;

    if (!overrideAccess && !isAgentAccessChecked(options)) {
      await assertAgentAccess({ req, agent: instance });
    }

    const selection = await assertStoredSelection({
      agent: instance,
      config,
      selection: options.selection ?? {},
      req,
    });

    const runId = options.runId ?? generateId();
    const preparedOptions = { ...options, req, overrideAccess, runId };
    const agent = { slug: agentConfig.slug, runId, chatId: options.chatId };
    const [mcp, denied] = await Promise.all([
      mcpServers.length === 0
        ? { tools: {}, approvals: new Map<string, ToolApprovalOption>() }
        : resolveMCPTools({
            agent: agentConfig.slug,
            servers: mcpServers,
            connections: deps.mcp,
            reserved: toolSlugs,
            abortSignal: call.abortSignal,
            logger: frogbot.logger,
          }),
      overrideAccess ? new Set<string>() : deniedTools({ req, agent }),
    ]);

    const op = gateway.operation({
      operation: 'chat.completions',
      model: selection.model,
      context: {
        req,
        agent,
        trackUsage: false,
      },
    });

    const autoApprove =
      options.autoApprove ??
      (asks && options.chatId !== undefined
        ? await readAutoApprove({ req, chatId: options.chatId })
        : false);

    const run: AgentRun = {
      op,
      selection,
      models: [],
      hashes: new Map(),
      mcpTools: mcp.tools,
      mcpApprovals: mcp.approvals,
      autoApprove,
      denied,
      ...(options.chatId !== undefined && options.compaction
        ? {
            compaction: createCompactionRun({
              req,
              chatId: options.chatId,
              config,
              tools,
              options: options.compaction,
              abortSignal: call.abortSignal,
            }),
          }
        : {}),
    };

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

  const runGenerate = async <O extends AIOutput = never>(
    call: Call,
    output?: O,
  ): Promise<AgentGenerateResult<O>> => {
    const { req, runId, run, call: preparedCall } = await prepareRun(call);
    const { op } = run;
    const model = run.selection.model;
    const userEnd = call.onEnd ?? call.onFinish;
    let unlogged: Parameters<typeof finishSteps>[0] | undefined;

    const logSteps = async () => {
      const steps = unlogged;
      unlogged = undefined;

      if (steps) {
        await finishSteps(steps, {
          req,
          runId,
          chatId: preparedCall.options.chatId,
          model,
          models: run.models,
        });
      }
    };

    await op.start();

    try {
      const result = await agentFor(output).generate({
        ...preparedCall,
        onEnd: async (event) => {
          unlogged = event.steps;

          if (userEnd) await userEnd(event);
        },
      });

      unlogged = result.steps;
      await logSteps();

      await op.finish({
        finishReason: result.finishReason,
        usage: toHookUsage(result.usage),
      });

      return result;
    } catch (error) {
      await logSteps().catch((logError: unknown) => {
        frogbot.logger.error({ error: logError }, '[frogbot] Failed to log agent run usage.');
      });

      await op.finish({ error });
      throw error;
    }
  };

  const runStream = async <O extends AIOutput = never>(
    call: StreamCall,
    output?: O,
  ): Promise<AgentStreamResult<O>> => {
    const { req, runId, run, call: preparedCall } = await prepareRun(call);
    const { op } = run;
    const model = run.selection.model;

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
      return await agentFor(output).stream({
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

  const generate = async <O extends AIOutput = never>(
    opts: AgentGenerateOpts<O>,
  ): Promise<AgentGenerateResult<O>> => {
    const { chatId, output, model: runModel, reasoning, ...runOpts } = opts;
    const req = await frogbot.createRequest(runOpts.req);
    const overrideAccess = runOpts.overrideAccess === true;

    if (!overrideAccess) await assertAgentAccess({ req, agent: instance });

    const requested = runSelection({ model: runModel, reasoning });

    if (requested) {
      await assertStoredSelection({ agent: instance, config, selection: requested, req });
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

    const { claim, uiMessages } = context;
    const selection = requested ?? context.selection;
    const lease = holdTurn({ req, claim });
    const compaction = createCompactionParts();

    try {
      const result = await runGenerate(
        await buildCall(
          {
            messages: uiMessages,
            req,
            overrideAccess,
            chatId: context.chatId,
            selection,
            autoApprove: runOpts.autoApprove,
            compaction: { history: uiMessages, emit: compaction.emit },
            abortSignal: AbortSignal.any([
              lease.signal,
              ...(runOpts.abortSignal ? [runOpts.abortSignal] : []),
            ]),
          },
          { accessChecked: true },
        ),
        output,
      ).catch(async (error: unknown) => {
        await persistCompactionParts({ req, chatId: context.chatId, uiMessages, compaction }).catch(
          (persistError: unknown) => {
            frogbot.logger.error(
              { error: persistError },
              '[frogbot] Failed to save the compaction of a failed run.',
            );
          },
        );

        throw error;
      });

      const model = selection.model ?? (await userDefaultModel({ agent: instance, req }));

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
        compaction,
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

  const stream = async <O extends AIOutput = never>({
    output,
    model,
    reasoning,
    ...opts
  }: AgentStreamOpts<O>): Promise<AgentStreamResult<O>> => {
    const selection = runSelection({ model, reasoning });

    return runStream(await buildCall(selection ? { ...opts, selection } : opts), output);
  };

  const streamMessage = async (
    opts: AgentStreamMessageOpts,
  ): Promise<AgentStreamMessageResult | AgentStreamMessageQueuedResult> => {
    const { chatId, channelAccess, clientTools, delivery, ...runOpts } = opts;
    const req = await frogbot.createRequest(runOpts.req);
    const overrideAccess = runOpts.overrideAccess === true;

    if (!overrideAccess && !isAgentAccessChecked(opts)) {
      await assertAgentAccess({ req, agent: instance });
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
      overrideAccess,
      autoApprove: runOpts.autoApprove,
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

function runSelection({ model, reasoning }: AgentSelection): AgentSelection | undefined {
  if (model === undefined && reasoning === undefined) return undefined;

  return {
    ...(model === undefined ? {} : { model }),
    ...(reasoning === undefined ? {} : { reasoning }),
  };
}

async function persistCompactionParts({
  req,
  chatId,
  uiMessages,
  compaction,
}: {
  req: FrogBotRequest;
  chatId: number | string;
  uiMessages: UIMessage[];
  compaction: CompactionParts;
}): Promise<void> {
  const parts = compaction.parts();

  if (parts.length === 0) return;

  const last = uiMessages.at(-1);
  const message: UIMessage =
    last?.role === 'assistant'
      ? { ...last, parts: [...last.parts, ...parts] }
      : { id: generateId(), role: 'assistant', parts };

  await persistAssistantMessage({ req, chatId, message });
}

async function readAutoApprove({
  req,
  chatId,
}: {
  req: FrogBotRequest;
  chatId: number | string;
}): Promise<boolean> {
  const chat = (await req.frogbot.findByID({
    collection: messagesConfig(req).chatsSlug,
    id: chatId,
    depth: 0,
    disableErrors: true,
    req,
    overrideAccess: true,
  })) as { autoApprove?: boolean | null } | null;

  return chat?.autoApprove === true;
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
