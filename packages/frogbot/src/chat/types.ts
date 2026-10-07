import type { AgentProfile } from '../agents/types.js';

export type SanitizedChatConfig =
  | { enabled: false }
  | { enabled: true; chatsSlug: string; messagesSlug: string; assetsSlug: string };

export type ManifestResponse = {
  ai: { transcribe: { model: string } | false };
  chat: SanitizedChatConfig;
  files?: { slug: string };
  agents: { slug: string; profile?: AgentProfile }[];
};
