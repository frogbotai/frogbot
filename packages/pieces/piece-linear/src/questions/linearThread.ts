import { AgentActivitySignal, type LinearDocument } from '@linear/sdk';
import type { QuestionInteraction } from 'frogbot/pieces';

import type { LinearChannelRawMessage } from '../adapter.js';
import type { Linear } from '../client.js';

const SESSION_THREAD = /^linear:[^:]+(?::c:[^:]+)?:s:([^:]+)$/;

export type LinearActivity = Omit<LinearDocument.AgentActivityCreateInput, 'agentSessionId'>;

export function agentSessionId(threadId: string): string | undefined {
  return SESSION_THREAD.exec(threadId)?.[1];
}

export function stopRequested(interaction: QuestionInteraction): boolean {
  if (interaction.type !== 'message') return false;

  const raw = interaction.message.raw as LinearChannelRawMessage | undefined;

  return raw?.agentActivitySignal === AgentActivitySignal.Stop;
}

export async function postActivity({
  activity,
  client,
  threadId,
}: {
  activity: LinearActivity;
  client: Linear;
  threadId: string;
}): Promise<string> {
  const sessionId = agentSessionId(threadId);

  if (!sessionId) throw new Error(`Linear thread '${threadId}' is not an agent session.`);

  const result = await client.createAgentActivity({ ...activity, agentSessionId: sessionId });
  const id = result.agentActivityId;

  if (!result.success || !id) {
    throw new Error(`Linear did not create the agent activity in session '${sessionId}'.`);
  }

  return id;
}
