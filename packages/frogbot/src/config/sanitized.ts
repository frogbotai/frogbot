import type { SettingsEntry } from '../admin/types.js';
import type { SanitizedAgentConfig } from '../agents/types.js';
import type { SanitizedAIConfig } from '../ai/types.js';
import type { SanitizedChatConfig } from '../chat/types.js';
import type { SanitizedConnectionsConfig } from '../connections/types.js';
import type { FrogBot } from '../frogbot.js';
import type { SanitizedPiecesConfig } from '../pieces/types.js';
import type { SearchIndexDescriptors } from '../search/types.js';
import type { IngressRegistry } from '../triggers/types.js';
import type { SanitizedFilesConfig } from '../uploads/types.js';

export type SanitizedCollectionMeta = {
  slug: string;
  auth: boolean;
  search?: SearchIndexDescriptors;
};

export type FrogBotSanitizedConfig = {
  admin?: {
    importMap?: {
      autoGenerate?: boolean;
    };
  };
  collections: SanitizedCollectionMeta[];
  secret: string;
  port?: number;
  onInit?: (frogbot: FrogBot) => Promise<void> | void;
  ai?: SanitizedAIConfig;
  agents?: SanitizedAgentConfig[];
  chat: SanitizedChatConfig;
  connections: SanitizedConnectionsConfig;
  files?: SanitizedFilesConfig;
  pieces: SanitizedPiecesConfig;
  roles: string[];
  settings: SettingsEntry[];
  typescript?: {
    autoGenerate?: boolean;
  };

  /** @internal — not part of the public API. */
  _internal: {
    payloadConfig: Promise<import('payload').SanitizedConfig>; // eslint-disable-line @typescript-eslint/consistent-type-imports -- keeps payload out of the static import graph
    noEmail: boolean;
    triggers: IngressRegistry;
    autonumbers: AutonumberEntry[];
  };
};

/** @internal — not part of the public API. */
export type AutonumberEntry = {
  collection: string;
  path: string;
};
