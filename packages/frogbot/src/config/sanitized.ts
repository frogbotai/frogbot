// FrogBot's sanitized config shape — the output of `buildConfig`.
//
// Preserves FrogBot metadata (auth flags, onInit) through the
// sanitization boundary. The Payload config is stored internally and
// never exposed to users.

import type { SettingsEntry } from '../admin/types.js';
import type { SanitizedAgentConfig } from '../agents/types.js';
import type { SanitizedAIConfig } from '../ai/types.js';
import type { SanitizedChatConfig } from '../chat/types.js';
import type { SanitizedConnectionsConfig } from '../connections/types.js';
import type { Frogbot } from '../frogbot.js';
import type { SanitizedPiecesConfig } from '../pieces/types.js';
import type { SanitizedFilesConfig } from '../uploads/types.js';

export type SanitizedCollectionMeta = {
  slug: string;
  auth: boolean;
};

export type FrogbotSanitizedConfig = {
  admin?: {
    importMap?: {
      autoGenerate?: boolean;
    };
  };
  collections: SanitizedCollectionMeta[];
  secret: string;
  port?: number;
  onInit?: (frogbot: Frogbot) => Promise<void> | void;
  ai?: SanitizedAIConfig;
  agents?: SanitizedAgentConfig[];
  chat: SanitizedChatConfig;
  connections: SanitizedConnectionsConfig;
  files: SanitizedFilesConfig;
  pieces: SanitizedPiecesConfig;
  roles: string[];
  settings: SettingsEntry[];
  typescript?: {
    autoGenerate?: boolean;
  };

  /** @internal — not part of the public API. */
  _internal: {
    payloadConfig: Promise<import('payload').SanitizedConfig>; // eslint-disable-line @typescript-eslint/consistent-type-imports
    noEmail: boolean;
  };
};
