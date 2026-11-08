import type { SettingsEntry } from '../admin/types.js';
import type { SanitizedAgentConfig } from '../agents/types.js';
import type { SanitizedAIConfig } from '../ai/types.js';
import type { DeployTarget } from '../bin/deploy/types.js';
import type { SanitizedChatConfig } from '../chat/types.js';
import type { SanitizedConnectionsConfig } from '../connections/types.js';
import type { FrogBot } from '../frogbot.js';
import type { SanitizedPiecesConfig } from '../pieces/types.js';
import type { SearchIndexDescriptors } from '../search/types.js';
import type { IngressRegistry } from '../triggers/types.js';
import type { SanitizedFilesConfig } from '../uploads/types.js';
import type { CLICommand } from './types.js';

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
  cli: { commands: Record<string, CLICommand>; deployTargets: Record<string, DeployTarget> };
  connections: SanitizedConnectionsConfig;
  files?: SanitizedFilesConfig;
  pieces: SanitizedPiecesConfig;
  settings: SettingsEntry[];
  typescript?: {
    autoGenerate?: boolean;
  };
  /** The config's `custom`, unchanged: server-only data plugins keep for themselves. */
  custom?: Record<string, unknown>;

  /** @internal — not part of the public API. */
  _internal: {
    payloadConfig: Promise<import('payload').SanitizedConfig>; // eslint-disable-line @typescript-eslint/consistent-type-imports -- keeps payload out of the static import graph
    noEmail: boolean;
    triggers: IngressRegistry;
    autonumbers: AutonumberEntry[];
    /** Filled once Payload has built the config. */
    autonumberKeys: AutonumberKeyEntry[];
  };
};

/** @internal — not part of the public API. */
export type AutonumberEntry = {
  collection: string;
  path: string;
  scope?: AutonumberScope;
};

/** @internal — not part of the public API. */
export type AutonumberScope = {
  name: string;
  path: string;
};

/** @internal — an `autonumberKeyField` as declared, before its fields are checked. */
export type AutonumberKeyDeclaration = {
  collection: string;
  path: string;
  /** The sibling number field's name and path. */
  number: { name: string; path: string };
  prefix: string;
};

/** @internal — not part of the public API. */
export type AutonumberKeyEntry = {
  collection: string;
  path: string;
  number: AutonumberEntry & { scope: AutonumberScope };
  prefix: { collection: string; path: string };
};
