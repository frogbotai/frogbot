import type { UIMessage, UIMessageChunk } from 'ai';
import {
  consumeStream,
  convertToModelMessages,
  createUIMessageStream,
  generateId,
  toUIMessageStream,
} from 'ai';

import type { AgentInstance, AgentModelId, AgentStreamResult } from '../../agents/types.js';
import { resolveModel } from '../../ai/resolve.js';
import { isClientTool } from '../../tools/types.js';
import type { FrogBotRequest } from '../../types/request.js';
import { createMessageUsage, persistAssistantMessage } from '../messagePersistence.js';
import {
  findMessage,
  hasPendingParts,
  persistTurnMessage,
  repairInterruptedParts,
} from './messages.js';
import { promoteQueuedMessage } from './queue.js';
import { holdTurn, releaseTurn } from './state.js';
import type { ClientToolsOption, TurnClaim } from './types.js';

export type StreamTurnProps = {
  req: FrogBotRequest;
  agent: AgentInstance;
  claim: TurnClaim;
  uiMessages: UIMessage[];
  providerMessages?: UIMessage[];
  model?: AgentModelId;
  clientTools?: ClientToolsOption;
  abortSignal?: AbortSignal;
  onError?: (error: unknown) => string;
};

export type TurnStream = {
  result: AgentStreamResult;
  uiMessageStream: ReadableStream<UIMessageChunk>;
  persistence: Promise<void>;
};

export function allClientTools(agent: AgentInstance): ClientToolsOption {
  return {
    kinds: [
      ...new Set((agent.config.tools ?? []).filter(isClientTool).map((tool) => tool.client.kind)),
    ],
  };
}

export async function streamTurn({
  req,
  agent,
  claim,
  uiMessages,
  providerMessages = uiMessages,
  model,
  clientTools,
  abortSignal,
  onError,
}: StreamTurnProps): Promise<TurnStream> {
  const chatId = claim.chatId;
  const turnReq = await req.frogbot.createRequest({ user: req.user, context: req.context });
  const lease = holdTurn({ req: turnReq, claim });
  const checkpointFailure = new AbortController();
  const signals = [lease.signal, checkpointFailure.signal, ...(abortSignal ? [abortSignal] : [])];
  const mainModel = resolveModel(model ?? agent.config.model, req.frogbot.config.ai!);

  const last = uiMessages.at(-1);
  const messageId = last?.role === 'assistant' ? last.id : generateId();
  const replyCreatedAt =
    (last?.role === 'assistant'
      ? (await findMessage({ req: turnReq, id: last.id }))?.createdAt
      : undefined) ?? new Date(Date.now() + 2).toISOString();

  let result: AgentStreamResult;

  try {
    result = await agent.aiAgent.stream({
      messages: await convertToModelMessages(providerMessages, { tools: agent.aiAgent.tools }),
      options: { req, overrideAccess: true, chatId, replyCreatedAt, model, clientTools },
      abortSignal: AbortSignal.any(signals),
    });
  } catch (error) {
    lease.stop();

    if (await releaseTurn({ req: turnReq, claim, state: 'idle' })) {
      await promoteQueuedMessage({ req: turnReq, chatId });
    }

    throw error;
  }

  let awaiting = false;

  const stream = createUIMessageStream({
    originalMessages: uiMessages,
    generateId: () => messageId,
    onError,
    execute: ({ writer }) => {
      writer.merge(
        toUIMessageStream({
          stream: result.stream,
          tools: agent.aiAgent.tools,
          originalMessages: uiMessages,
          generateMessageId: () => messageId,
          sendSources: true,
          onError,
          messageMetadata: ({ part }) =>
            part.type === 'finish'
              ? { usage: createMessageUsage(part.totalUsage, mainModel) }
              : undefined,
        }),
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
