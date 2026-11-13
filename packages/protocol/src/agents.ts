import type { ModelModality } from './ai.js';

/** The `code` an agent endpoint error carries, so a caller can branch on it instead of the message. */
export type AgentErrorCode =
  | 'access-denied'
  | 'access-error'
  | 'agent-not-found'
  | 'model-not-allowed'
  | 'no-model-available'
  | 'reasoning-unavailable'
  | 'unauthenticated';

export type AgentProfile = {
  name?: string;
  avatar?: string;
  description?: string;
};

export type AgentReasoningOption = {
  key: string;
  label: string;
};

/** A line shown with one provider's models in the model picker, such as "Using ChatGPT plan". */
export type AgentModelNotice = {
  text: string;
  link?: { label: string; url: string };
};

/** One agent in the chat manifest. `TModel` narrows model ids to an app's generated union. */
export type AgentManifestEntry<TModel extends string = string> = {
  slug: string;
  label: string;
  source: 'config' | 'collection';
  defaultModel: TModel;
  models: TModel[];
  names?: Partial<Record<TModel, string>>;
  reasoning?: Partial<Record<TModel, AgentReasoningOption[]>>;
  inputs?: Partial<Record<TModel, ModelModality[]>>;
  /** Notices by provider, the part of a model ID before `/`, for the user's linked accounts. */
  notices?: Partial<Record<string, AgentModelNotice>>;
  /** Set when a tool of the agent, or an MCP `tools` entry, may ask for approval. */
  approval?: true;
};
