import { TurnError } from '../chat/turn/errors.js';
import { listPendingCalls } from '../chat/turn/settle.js';
import type { TurnStream } from '../chat/turn/streamTurn.js';
import type { DocID } from '../collections/config/types.js';
import type { FrogBotRequest } from '../types/request.js';
import { AgentServiceError, getAgentAuthorizations } from './service.js';
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

export function errorResponse(error: unknown): Response {
  const code = error instanceof TurnError ? error.code : undefined;

  return Response.json(
    {
      error: error instanceof Error ? error.message : 'Agent request failed',
      ...(code ? { code } : {}),
    },
    { status: getErrorStatus(error) },
  );
}

export function getErrorStatus(error: unknown): number {
  if (error instanceof AgentServiceError) return error.status;

  if (typeof error !== 'object' || error === null) return 500;

  const status =
    'status' in error ? error.status : 'statusCode' in error ? error.statusCode : undefined;

  return typeof status === 'number' && status >= 400 && status <= 599 ? status : 500;
}
