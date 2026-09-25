import type { UIMessage } from 'ai';
import { getToolName } from 'ai';

import { assertAgentAccess, getAgent } from '../../agents/service.js';
import type { DocID } from '../../collections/config/types.js';
import { updateIfVersion } from '../../database/compareAndSet.js';
import type { ClientTool } from '../../tools/types.js';
import { isClientTool } from '../../tools/types.js';
import type { FrogBotRequest } from '../../types/request.js';
import type { ChannelChatAccess } from '../channelAccess.js';
import { findChat } from '../findChat.js';
import { actorFromRequest } from './actor.js';
import { TurnError } from './errors.js';
import type { ToolPart, TurnMessageDocument } from './messages.js';
import { findTurnMessage, getPendingCalls, isToolPart, messagesConfig } from './messages.js';
import { promoteQueuedMessage } from './queue.js';
import { closeAwaitingTurn, findTurnState } from './state.js';
import type { ClientToolSettlement, PendingCall, TurnActor } from './types.js';

export const DISMISSED_TOOL_ERROR = 'Dismissed by the user.';
export const CANCELLED_TOOL_ERROR = 'Cancelled because the user dismissed a related request.';

const MAX_SETTLE_ATTEMPTS = 5;

export type SettleOutcome = { output: unknown; dismissed?: never } | { dismissed: true };

export type SettleClientToolCallProps = {
  req: FrogBotRequest;
  chatId: DocID;
  toolCallId: string;
  outcome: SettleOutcome;
  actor?: TurnActor;
  channelAccess?: ChannelChatAccess;
};

export type SettleClientToolCallResult = {
  status: 'settled' | 'already-settled';
  part: ToolPart;
  allSettled: boolean;
};

export async function settleClientToolCall({
  req,
  chatId,
  toolCallId,
  outcome,
  actor,
  channelAccess,
}: SettleClientToolCallProps): Promise<SettleClientToolCallResult> {
  const chat = await findChat({ req, chatId, channelAccess });
  const agentSlug = chat.agent ?? '';

  await assertAgentAccess({ req, agent: getAgent({ req, slug: agentSlug }) });

  return settleCall({
    req,
    agentSlug,
    chatId: chat.id,
    toolCallId,
    outcome,
    actor: actor ?? actorFromRequest(req),
  });
}

export async function listPendingCalls({
  req,
  chatId,
  channelAccess,
}: {
  req: FrogBotRequest;
  chatId: DocID;
  channelAccess?: ChannelChatAccess;
}): Promise<PendingCall[]> {
  const chat = await findChat({ req, chatId, channelAccess });

  if ((await findTurnState({ req, chatId: chat.id })) !== 'awaiting') return [];

  const message = await findTurnMessage({ req, chatId: chat.id });

  return message ? getPendingCalls({ message, chatId: chat.id, agentSlug: chat.agent ?? '' }) : [];
}

export async function settleCall({
  req,
  agentSlug,
  chatId,
  toolCallId,
  outcome,
  actor,
}: {
  req: FrogBotRequest;
  agentSlug: string;
  chatId: DocID;
  toolCallId: string;
  outcome: SettleOutcome;
  actor: TurnActor;
}): Promise<SettleClientToolCallResult> {
  const agent = getAgent({ req, slug: agentSlug });
  const awaiting = (await findTurnState({ req, chatId })) === 'awaiting';

  for (let attempt = 0; attempt < MAX_SETTLE_ATTEMPTS; attempt++) {
    const message = await findSettlementMessage({ req, chatId, toolCallId });
    const part = message?.parts.find(
      (candidate): candidate is ToolPart =>
        isToolPart(candidate) && candidate.toolCallId === toolCallId,
    );

    if (!message || !part) {
      throw new TurnError('call-not-found', `Tool call '${toolCallId}' was not found.`);
    }

    const pending = getPendingCalls({ message, chatId, agentSlug });
    const call = pending.find((candidate) => candidate.toolCallId === toolCallId);

    if (!call) return { status: 'already-settled', part, allSettled: pending.length === 0 };

    if (!awaiting) throw new TurnError('not-awaiting', 'This chat is not awaiting input.');

    const tool = (agent.config.tools ?? []).find(
      (candidate): candidate is ClientTool =>
        isClientTool(candidate) && candidate.slug === getToolName(part),
    );

    if (tool?.client.access && !(await tool.client.access({ req, call }))) {
      throw new TurnError('forbidden', 'You cannot settle this call.');
    }

    const settledPart =
      'dismissed' in outcome && outcome.dismissed
        ? terminal(part, DISMISSED_TOOL_ERROR)
        : ({
            ...part,
            state: 'output-available',
            output: await validateOutput({ tool, part, output: outcome.output }),
          } as ToolPart);

    const at = new Date().toISOString();
    const settlements: Record<string, ClientToolSettlement> = {
      ...message.settlements,
      [toolCallId]: {
        outcome: settledPart.state === 'output-error' ? 'dismissed' : 'answered',
        actor,
        at,
      },
    };

    const parts = message.parts.map((candidate) => {
      if (!isToolPart(candidate)) return candidate;

      if (candidate.toolCallId === toolCallId) return settledPart;

      if (settledPart.state !== 'output-error') return candidate;

      if (!pending.some(({ toolCallId: id }) => id === candidate.toolCallId)) return candidate;

      settlements[candidate.toolCallId] = { outcome: 'cancelled', actor, at };

      return terminal(candidate, CANCELLED_TOOL_ERROR);
    }) as UIMessage['parts'];

    const written = await updateIfVersion({
      req,
      collection: messagesConfig(req).messagesSlug,
      id: message.id,
      version: message.version ?? 0,
      data: { parts, settlements },
    });

    if (!written) continue;

    const allSettled = pending.length === 1 || settledPart.state === 'output-error';

    if (settledPart.state === 'output-error' && (await closeAwaitingTurn({ req, chatId }))) {
      promoteQueuedMessage({ req, chatId });
    }

    return { status: 'settled', part: settledPart, allSettled };
  }

  throw new TurnError('write-conflict', `Tool call '${toolCallId}' changed during every attempt.`);
}

async function findSettlementMessage({
  req,
  chatId,
  toolCallId,
}: {
  req: FrogBotRequest;
  chatId: DocID;
  toolCallId: string;
}): Promise<TurnMessageDocument | undefined> {
  const message = await findTurnMessage({ req, chatId });

  if (message?.parts.some((part) => isToolPart(part) && part.toolCallId === toolCallId)) {
    return message;
  }

  return undefined;
}

async function validateOutput({
  tool,
  part,
  output,
}: {
  tool?: ClientTool;
  part: ToolPart;
  output: unknown;
}): Promise<unknown> {
  if (!tool) {
    throw new TurnError('invalid-output', `Tool '${getToolName(part)}' cannot be answered.`);
  }

  const parsed = await tool.outputSchema.safeParseAsync(output);

  if (!parsed.success) {
    throw new TurnError('invalid-output', `Invalid output for '${tool.slug}'.`);
  }

  const valid = tool.client.validate?.({ input: part.input, output: parsed.data }) ?? true;

  if (valid !== true) throw new TurnError('invalid-output', valid);

  return parsed.data;
}

function terminal(part: ToolPart, errorText: string): ToolPart {
  return { ...part, state: 'output-error', errorText } as ToolPart;
}
