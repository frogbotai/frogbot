import type { AgentProfile } from './agent.js';

// Resolved chat persistence state — derived from `thread: true` /
// `message: true` markers on collections (or injected defaults), never
// from a config key. Milestone B reads the slugs from here.

export type SanitizedChatConfig =
  | { enabled: false }
  | { enabled: true; threadsSlug: string; messagesSlug: string };

export type ManifestResponse = {
  chat: SanitizedChatConfig;
  files: { slug: string };
  agents: { slug: string; profile?: AgentProfile }[];
};
