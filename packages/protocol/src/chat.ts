import type { AgentManifestEntry, AgentProfile } from './agents.js';

export type TurnState = 'idle' | 'running' | 'awaiting';

export type TurnErrorCode =
  | 'already-settled'
  | 'call-not-found'
  | 'channel-chat'
  | 'forbidden'
  | 'invalid-output'
  | 'not-awaiting'
  | 'not-found'
  | 'not-queued'
  | 'pending-calls'
  | 'selection-unavailable'
  | 'turn-in-progress'
  | 'write-conflict';

/** What the chat UI loads from a backend before it renders: its agents and features. */
export type ChatManifest<TModel extends string = string> = {
  defaultAgent: string;
  agents: (AgentManifestEntry<TModel> & { profile?: AgentProfile })[];
  transcribe: boolean;
  /** Read aloud is available: the adapter's `speak` may be called. */
  speak?: boolean;
};
