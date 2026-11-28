import { listPendingCalls } from '../chat/turn/settle.js';
import type { TurnStream } from '../chat/turn/streamTurn.js';
import type { DocID } from '../collections/config/types.js';
import type { FrogBotRequest } from '../types/request.js';
import { getAgentAuthorizations } from './service.js';
import type { AgentInstance } from './types.js';

export async function agentResult({
  req,
  agent,
  chatId,
  turn,
}: {
  req: FrogBotRequest;
  agent: AgentInstance;
  chatId: DocID;
  turn: Pick<TurnStream, 'result'>;
}) {
  const [text, usage, finishReason, pending] = await Promise.all([
    turn.result.text,
    turn.result.totalUsage,
    turn.result.finishReason,
    listPendingCalls({ req, chatId }),
  ]);

  return {
    status: pending.length > 0 ? ('awaiting-input' as const) : ('completed' as const),
    text,
    usage,
    finishReason,
    authorizations: req.user ? await getAgentAuthorizations({ req, agent }) : [],
    chatId,
    ...(pending.length > 0 ? { pending } : {}),
  };
}
