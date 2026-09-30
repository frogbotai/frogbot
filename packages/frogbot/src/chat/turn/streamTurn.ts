import type { UIMessage, UIMessageChunk } from 'ai';
import {
  consumeStream,
  convertToModelMessages,
  createUIMessageStream,
  generateId,
  toUIMessageStream,
} from 'ai';

import { userDefaultModel } from '../../agents/service.js';
import type { AgentInstance, AgentSelection, AgentStreamResult } from '../../agents/types.js';
import { aiErrorMessage } from '../../ai/errorMessage.js';
import { resolveModel } from '../../ai/resolve.js';
import { isClientTool } from '../../tools/types.js';
import type { FrogBotRequest } from '../../types/request.js';
import { createMessageUsage, persistAssistantMessage } from '../messagePersistence.js';
import { TurnError } from './errors.js';
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
  selection: AgentSelection;
  clientTools?: ClientToolsOption;
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
  };
}

export async function streamTurn({
  req,
  agent,
  claim,
  uiMessages,
  providerMessages = uiMessages,
  selection,
  clientTools,
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

  let result: AgentStreamResult;
  let mainModel: string;

  try {
    result = await agent.aiAgent.stream({
      messages: await convertToModelMessages(providerMessages, { tools: agent.aiAgent.tools }),
      options: { req, overrideAccess: true, chatId, replyCreatedAt, selection, clientTools },
      abortSignal: AbortSignal.any(signals),
    });

    const model = selection.model ?? userDefaultModel({ agent, user: req.user });

    if (model === undefined) {
      throw new Error(`[frogbot] Agent '${agent.slug}' has no validated model for this user.`);
    }

    mainModel = resolveModel(model, req.frogbot.config.ai!);
  } catch (error) {
    lease.stop();

    if (await releaseTurn({ req: turnReq, claim, state: 'idle' })) {
      await promoteQueuedMessage({ req: turnReq, chatId });
    }

    throw error;
  }

  const source = result.stream.pipeThrough(
    new TransformStream({
      transform: (part, controller) => {
        if (part.type === 'error') {
          controller.error(part.error);

          return;
        }

        controller.enqueue(part);
      },
    }),
  );

  let awaiting = false;

  const errorText =
    onError ??
    ((error: unknown) =>
      aiErrorMessage({ error, model: mainModel, config: req.frogbot.config.ai }) ??
      (error instanceof TurnError ? error.message : TURN_ERROR_MESSAGE));

  const stream = createUIMessageStream({
    originalMessages: uiMessages,
    generateId: () => messageId,
    onError: errorText,
    execute: ({ writer }) => {
      writer.merge(
        toUIMessageStream({
          stream: source,
          tools: agent.aiAgent.tools,
          originalMessages: uiMessages,
          generateMessageId: () => messageId,
          sendSources: true,
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
