import type { AgentPieceTrigger } from '../agents/types.js';
import type { PieceInstance, PieceTriggerReference } from '../pieces/types.js';

export type TriggerEvent<TData = unknown> = { dedupeKey: string; data: TData };

export type TriggerSubscriber = {
  agentSlug: string;
  piece: PieceInstance;
  trigger: AgentPieceTrigger & { trigger: PieceTriggerReference };
  input: unknown;
};

export type IngressRegistry = Record<
  string,
  { instance: PieceInstance; subscribers: TriggerSubscriber[]; channelAgentSlug?: string }
>;
