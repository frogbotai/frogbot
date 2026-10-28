import type { RootAdminConfig, SettingsEntry } from '../admin/types.js';
import type { AgentConfig } from '../agents/types.js';
import type { AIConfig } from '../ai/types.js';
import type { CollectionConfig } from '../collections/config/types.js';
import type { ConnectionsConfig } from '../connections/types.js';
import type { DatabaseAdapter } from '../database/types.js';
import type { Endpoint } from '../endpoints/types.js';
import type { Block } from '../fields/config/types.js';
import type { FrogBot, InitOptions } from '../frogbot.js';
import type { JobsConfig } from '../jobs/types.js';
import type { MCPServer } from '../mcp/types.js';
import type { EmailPiece } from '../pieces/email.js';
import type { Plugin } from '../plugin.js';
import type { AnyTool } from '../tools/types.js';
import type {
  Locale,
  PayloadCollectionConfig,
  PayloadConfig,
  SanitizedCollectionConfig,
} from '../types/payload.js';
import type { FrogBotArgs, FrogBotRequest } from '../types/request.js';
import type { StorageAdapter } from '../uploads/types.js';
import type { FrogBotSanitizedConfig } from './sanitized.js';

export type LivePreviewURLType = null | string | undefined;

export type LivePreviewURLArgs = {
  collectionConfig?: SanitizedCollectionConfig;
  data: Record<string, unknown>;
  locale: Locale;
  req: FrogBotRequest;
};

export type LivePreviewConfig = {
  breakpoints?: {
    height: number | string;
    label: string;
    name: string;
    width: number | string;
  }[];
  openByDefault?: boolean;
  url?:
    | ((args: LivePreviewURLArgs) => LivePreviewURLType | Promise<LivePreviewURLType>)
    | LivePreviewURLType;
};

export type RootLivePreviewConfig = LivePreviewConfig & {
  collections?: string[];
};

type PayloadPreview = NonNullable<NonNullable<PayloadCollectionConfig['admin']>['preview']>;

export type GeneratePreviewURL = (
  doc: Parameters<PayloadPreview>[0],
  options: FrogBotArgs<Parameters<PayloadPreview>[1]>,
) => ReturnType<PayloadPreview>;

type PayloadLocalizationConfig = Exclude<NonNullable<PayloadConfig['localization']>, false>;

type PayloadFilterAvailableLocales = NonNullable<
  PayloadLocalizationConfig['filterAvailableLocales']
>;

type LocalizationConfig = PayloadLocalizationConfig extends infer TConfig
  ? TConfig extends unknown
    ? Omit<TConfig, 'filterAvailableLocales'> & {
        filterAvailableLocales?: (
          args: FrogBotArgs<Parameters<PayloadFilterAvailableLocales>[0]>,
        ) => ReturnType<PayloadFilterAvailableLocales>;
      }
    : never
  : never;

type PayloadAfterErrorHook = NonNullable<NonNullable<PayloadConfig['hooks']>['afterError']>[number];

export type AfterErrorHook = (
  args: Omit<Parameters<PayloadAfterErrorHook>[0], 'req'> & { req: FrogBotRequest },
) => ReturnType<PayloadAfterErrorHook>;

export type RootHooks = {
  afterError?: AfterErrorHook[];
};

/** What `frogbot <name>` hands an app command. */
export type CLICommandContext = {
  /** Everything after the command name. */
  args: string[];
  /** The name the command was run as. */
  command: string;
  /** Resolves to the app config `frogbot` already loaded. */
  getConfig: () => Promise<FrogBotSanitizedConfig>;
  /** Boots one FrogBot instance on first call and returns it after; destroyed when the command ends. */
  getFrogBot: (options?: Omit<InitOptions, 'config'>) => Promise<FrogBot>;
};

/** A command run by `frogbot <name>`. A thrown error prints and exits 1; otherwise `frogbot` exits with `process.exitCode ?? 0` once it resolves. */
export type CLICommand = (context: CLICommandContext) => unknown | Promise<unknown>;

type FrogBotOverridden =
  | 'admin'
  | 'blocks'
  | 'cli'
  | 'collections'
  | 'db'
  | 'email'
  | 'endpoints'
  | 'globals'
  | 'hooks'
  | 'jobs'
  | 'localization'
  | 'onInit'
  | 'plugins'
  | 'secret'
  | 'storage';

export type OnInit = (frogbot: FrogBot) => Promise<void> | void;

export type FrogBotConfig = Omit<PayloadConfig, FrogBotOverridden> & {
  blocks?: Block[];
  /** Server-side secret used for tokens, cookies, and signing. */
  secret: string;
  /** Database adapter from a third-party package. */
  db: DatabaseAdapter;
  jobs?: JobsConfig;
  localization?: false | LocalizationConfig;
  /** Collections authored with FrogBot's `CollectionConfig`. */
  collections: CollectionConfig[];
  email?: EmailPiece | Promise<EmailPiece>;
  /** Agent configs registered at boot and exposed via frogbot.agents. */
  agents?: AgentConfig[];
  /** Standalone tools and MCP servers available to agents, outside of any piece. */
  tools?: readonly (AnyTool | MCPServer)[];
  /** Third-party account linking — which providers users can connect. */
  connections?: ConnectionsConfig;
  /** File storage adapters from `@frogbotai/storage-*`. The first also serves FrogBot's upload collections. */
  storage?: StorageAdapter[];
  /** Plugin pipeline — runs serially, in order, before sanitization. */
  plugins?: Plugin[];
  /** Pages added to the admin settings area, each with its own route. */
  settings?: SettingsEntry[];
  /** Root-level admin configuration. */
  admin?: RootAdminConfig;
  /** Root-level custom endpoints. Handler receives FrogBotRequest. */
  endpoints?: Endpoint[];
  /** Root-level hooks. `req` is `FrogBotRequest`. */
  hooks?: RootHooks;
  /** Runs once after FrogBot boots, with the initialized instance. */
  onInit?: OnInit | OnInit[];
  /** AI configuration — providers, routers, hooks, and access control. */
  ai?: AIConfig;
  /** Commands `frogbot <name>` runs, keyed by lowercase name. One with a built-in's name replaces it. */
  cli?: { commands?: Record<string, CLICommand> };
  /**
   * Internal. Payload plugins that run inside Payload's `buildConfig`, for plugins that read
   * themselves back from Payload's `config.plugins`. Set by FrogBot plugins.
   */
  _payloadPlugins?: NonNullable<PayloadConfig['plugins']>;
};
