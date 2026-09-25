import { getAgent } from '../../agents/service.js';
import type { AgentStreamMessageResult } from '../../agents/types.js';
import type { DocID } from '../../collections/config/types.js';
import type { FrogBotRequest } from '../../types/request.js';
import type { ChannelChatAccess } from '../channelAccess.js';
import { findChat } from '../findChat.js';
import { findTurnMessage, getPendingCalls, loadChatHistory } from './messages.js';
import { claimTurn, findTurnState, releaseTurn } from './state.js';
import { streamTurn } from './streamTurn.js';
import type { ClientToolsOption } from './types.js';

export type ContinueTurnProps = {
  req: FrogBotRequest;
  chatId: DocID;
  channelAccess?: ChannelChatAccess;
  clientTools?: ClientToolsOption;
  abortSignal?: AbortSignal;
};

export type ContinueTurnResult = AgentStreamMessageResult | { status: 'not-ready' | 'claimed' };

export async function continueTurn({
  req,
  chatId,
  channelAccess,
  clientTools,
  abortSignal,
}: ContinueTurnProps): Promise<ContinueTurnResult> {
  const chat = await findChat({ req, chatId, channelAccess });
  const agent = getAgent({ req, slug: chat.agent ?? undefined });

  if ((await findTurnState({ req, chatId: chat.id })) !== 'awaiting') {
    return { status: 'not-ready' };
  }

  const message = await findTurnMessage({ req, chatId: chat.id });

  if (!message || getPendingCalls({ message, chatId: chat.id, agentSlug: agent.slug }).length > 0) {
    return { status: 'not-ready' };
  }

  const claim = await claimTurn({ req, chatId: chat.id, from: 'awaiting' });

  if (!claim) return { status: 'claimed' };

  let uiMessages;

  try {
    uiMessages = await loadChatHistory({ req, chatId: chat.id, tools: agent.aiAgent.tools });
  } catch (error) {
    await releaseTurn({ req, claim, state: 'awaiting' });

    throw error;
  }

  const turn = await streamTurn({
    req,
    agent,
    claim,
    uiMessages,
    clientTools,
    abortSignal,
    onError: (error) => {
      throw error;
    },
  });

  return Object.assign(turn.result, {
    chatId: chat.id,
    uiMessageStream: turn.uiMessageStream,
    persistence: turn.persistence,
  });
}
