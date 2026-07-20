// FrogBot's sanitized config shape — the output of `buildConfig`.
//
// Preserves FrogBot metadata (auth flags, onInit) through the
// sanitization boundary. The Payload config is stored internally and
// never exposed to users.

import type { Frogbot } from '../frogbot.js';
import type { AgentConfig } from './agent.js';
import type { SanitizedAIConfig } from './ai.js';
import type { SanitizedChatConfig } from './chat.js';

export type SanitizedCollectionMeta = {
  slug: string;
  auth: boolean;
};

export type FrogbotSanitizedConfig = {
  collections: SanitizedCollectionMeta[];
  secret: string;
  port?: number;
  onInit?: (frogbot: Frogbot) => Promise<void> | void;
  ai?: SanitizedAIConfig;
  agents?: AgentConfig[];
  chat: SanitizedChatConfig;
  typescript?: {
    autoGenerate?: boolean;
  };

  /** @internal — not part of the public API. */
  _internal: {
    payloadConfig: Promise<import('payload').SanitizedConfig>; // eslint-disable-line @typescript-eslint/consistent-type-imports
  };
};
