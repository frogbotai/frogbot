import type { AgentManifestEntry, AgentProfile } from './agents.js';

export type TurnState = 'idle' | 'running' | 'awaiting';

export type TurnErrorCode =
  | 'turn.already-settled'
  | 'turn.call-not-found'
  | 'turn.channel-chat'
  | 'turn.compaction-failed'
  | 'turn.forbidden'
  | 'turn.invalid-output'
  | 'turn.not-awaiting'
  | 'turn.not-found'
  | 'turn.not-queued'
  | 'turn.nothing-to-compact'
  | 'turn.pending-calls'
  | 'turn.selection-unavailable'
  | 'turn.in-progress'
  | 'turn.write-conflict';

/** What the chat UI loads from a backend before it renders: its agents and features. */
export type ChatManifest<TModel extends string = string> = {
  defaultAgent: string;
  agents: (AgentManifestEntry<TModel> & { profile?: AgentProfile })[];
  transcribe: boolean;
  /** Read aloud is available: the adapter's `speak` may be called. */
  speak?: boolean;
};
