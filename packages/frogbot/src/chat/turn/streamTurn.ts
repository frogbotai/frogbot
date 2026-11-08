import type { UIMessage, UIMessageChunk } from 'ai';
import { consumeStream, createUIMessageStream, generateId, toUIMessageStream } from 'ai';

import { withAgentAccessChecked } from '../../agents/service.js';
import type { AgentInstance, AgentSelection, AgentStreamResult } from '../../agents/types.js';
import { aiErrorMessage } from '../../ai/errorMessage.js';
import { isClientTool } from '../../tools/types.js';
import type { FrogBotRequest } from '../../types/request.js';
import { toCompactedModelMessages } from '../compaction/history.js';
import { createCompactionParts } from '../compaction/stream.js';
import { CompactionError } from '../compaction/summarize.js';
import { createMessageUsage, persistAssistantMessage } from '../messagePersistence.js';
import { toolErrorText } from '../toolErrorText.js';
import { TurnError } from './errors.js';
import {
  findMessage,
  hasPendingParts,
  persistTurnMessage,
  repairInterruptedParts,
} from './messages.js';
import { promoteQueuedMessage } from './queue.js';
import { assertStoredSelection } from './selection.js';
import { messageSourceIds, toolSources } from './sources.js';
import { holdTurn, releaseTurn } from './state.js';
import type { ClientToolsOption, TurnClaim } from './types.js';

export type StreamTurnProps = {
  req: FrogBotRequest;
  agent: AgentInstance;
  claim: TurnClaim;
  uiMessages: UIMessage[];
  strictAttachments?: boolean;
  selection: AgentSelection;
  clientTools?: ClientToolsOption;
  /** Whether the turn is trusted. Every caller has already checked agent access. */
  overrideAccess?: boolean;
  autoApprove?: boolean;
  abortSignal?: AbortSignal;
  onError?: (error: unknown) => string;
};

export type TurnStream = {
  result: AgentStreamResult;
  uiMessageStream: ReadableStream<UIMessageChunk>;
  persistence: Promise<void>;
};

const TURN_ERROR_MESSAGE =
  'Something went wrong generating a reply. Check the terminal for details.';

export function allClientTools(agent: AgentInstance): ClientToolsOption {
  return {
    kinds: [
      ...new Set((agent.config.tools ?? []).filter(isClientTool).map((tool) => tool.client.kind)),
    ],
    approval: true,
  };
}

export async function streamTurn({
  req,
  agent,
  claim,
  uiMessages,
  strictAttachments,
  selection,
  clientTools,
  overrideAccess = false,
  autoApprove,
  abortSignal,
  onError,
}: StreamTurnProps): Promise<TurnStream> {
  const chatId = claim.chatId;
  const turnReq = await req.frogbot.createRequest({ user: req.user, context: req.context });
  const lease = holdTurn({ req: turnReq, claim });
  const checkpointFailure = new AbortController();
  const signals = [lease.signal, checkpointFailure.signal, ...(abortSignal ? [abortSignal] : [])];

  const last = uiMessages.at(-1);
  const messageId = last?.role === 'assistant' ? last.id : generateId();
  const replyCreatedAt =
    (last?.role === 'assistant'
      ? (await findMessage({ req: turnReq, id: last.id }))?.createdAt
      : undefined) ?? new Date(Date.now() + 2).toISOString();

  const runId = generateId();
  let result: AgentStreamResult;
  let mainModel: string;
  const compaction = createCompactionParts();

  try {
    mainModel = (
      await assertStoredSelection({
        agent,
        config: req.frogbot.config.ai!,
        selection,
        req,
      })
    ).model;

    const messages = await toCompactedModelMessages({
      req,
      messages: uiMessages,
      chatId,
      model: mainModel,
      tools: agent.aiAgent.tools,
      onUnavailable: strictAttachments ? 'throw' : 'marker',
    });

    result = await agent.aiAgent.stream({
      messages,
      options: withAgentAccessChecked({
        req,
        overrideAccess,
        runId,
        chatId,
        replyCreatedAt,
        selection,
        clientTools,
        compaction: { history: uiMessages, emit: compaction.emit },
        ...(autoApprove === undefined ? {} : { autoApprove }),
      }),
      abortSignal: AbortSignal.any(signals),
    });
  } catch (error) {
    lease.stop();

    if (await releaseTurn({ req: turnReq, claim, state: 'idle' })) {
      await promoteQueuedMessage({ req: turnReq, chatId });
    }

    throw error;
  }

  let lastStepInputTokens: number | undefined;

  const source = result.stream
    .pipeThrough(
      new TransformStream({
        transform: (part, controller) => {
          if (part.type === 'error') {
            controller.error(part.error);

            return;
          }

          if (part.type === 'finish-step') lastStepInputTokens = part.usage.inputTokens;

          controller.enqueue(part);
        },
      }),
    )
    .pipeThrough(
      toolSources({
        tools: agent.config.tools ?? [],
        ctx: {
          req,
          frogbot: req.frogbot,
          agent: { slug: agent.slug, runId, chatId },
          overrideAccess,
        },
        seen: messageSourceIds(last?.role === 'assistant' ? last : undefined),
      }),
    );

  let awaiting = false;

  const errorText =
    onError ??
    ((error: unknown) =>
      aiErrorMessage({ error, model: mainModel, config: req.frogbot.config.ai }) ??
      (error instanceof TurnError || error instanceof CompactionError
        ? error.message
        : TURN_ERROR_MESSAGE));

  const stream = createUIMessageStream({
    originalMessages: uiMessages,
    generateId: () => messageId,
    onError: errorText,
    execute: ({ writer }) => {
      writer.merge(
        compaction.wrap(
          toUIMessageStream({
            stream: source,
            tools: agent.aiAgent.tools,
            originalMessages: uiMessages,
            generateMessageId: () => messageId,
            onError: toolErrorText,
            sendSources: true,
            messageMetadata: ({ part }) =>
              part.type === 'finish'
                ? { usage: createMessageUsage(part.totalUsage, mainModel, lastStepInputTokens) }
                : undefined,
          }),
        ),
      );
    },
    onStepEnd: async ({ responseMessage }) => {
      try {
        await persistTurnMessage({
          req: turnReq,
          chatId,
          message: responseMessage,
          createdAt: replyCreatedAt,
        });

        if (!hasPendingParts(responseMessage)) return;

        lease.stop();

        awaiting = await releaseTurn({ req: turnReq, claim, state: 'awaiting' });
      } catch (error) {
        checkpointFailure.abort(error);
      }
    },
    onEnd: async ({ responseMessage }) => {
      lease.stop();

      try {
        if (responseMessage.parts.length > 0) {
          await persistAssistantMessage({
            req: turnReq,
            chatId,
            createdAt: replyCreatedAt,
            message: awaiting
              ? responseMessage
              : { ...responseMessage, parts: repairInterruptedParts(responseMessage.parts) },
            history: uiMessages,
            mainModel,
          });
        }
      } finally {
        if (!awaiting && (await releaseTurn({ req: turnReq, claim, state: 'idle' }))) {
          await promoteQueuedMessage({ req: turnReq, chatId });
        }
      }
    },
  });

  const [uiMessageStream, persisted] = stream.tee();

  const persistence = consumeStream({
    stream: persisted,
    onError: (error) => {
      throw error;
    },
  });

  void persistence.catch(() => {});

  return { result, uiMessageStream, persistence };
}
