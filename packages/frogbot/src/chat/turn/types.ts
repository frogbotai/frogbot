import type { DocID } from '../../collections/config/types.js';

export type TurnState = 'idle' | 'running' | 'awaiting';

export type TurnClaim = {
  chatId: DocID;
  attempt: string;
};

export type TurnActor = {
  user: { collection: string; id: DocID } | null;
  channel?: {
    piece: string;
    account?: string;
    id: string;
    username?: string;
    name?: string;
  };
};

export type ClientToolSettlement = {
  outcome: 'answered' | 'dismissed' | 'cancelled';
  actor: TurnActor;
  at: string;
};

export type PendingCall = {
  toolCallId: string;
  toolName: string;
  input: unknown;
  messageId: string;
  chatId: DocID;
  agentSlug: string;
  createdAt: string;
};

export type ClientToolsOption = {
  kinds: readonly string[];
};

export type MessageDelivery = 'queue' | 'steer';
