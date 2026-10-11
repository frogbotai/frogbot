import type { ModelModality } from './ai.js';

export type AgentProfile = {
  name?: string;
  avatar?: string;
  description?: string;
};

export type AgentReasoningOption = {
  key: string;
  label: string;
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
};
