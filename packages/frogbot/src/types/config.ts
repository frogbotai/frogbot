// FrogBot's root configuration shape — what users hand to `buildConfig`.
//
// Extends Payload's `Config`, replacing the collections array with FrogBot's
// `CollectionConfig`, the admin block with FrogBot's `RootAdminConfig`, and
// forbidding `globals` entirely. Everything else passes through.
//
// Users import this from `'frogbot'` and never see the underlying Payload
// type name or import path.

import type { Frogbot } from '../frogbot.js';
import type { RootAdminConfig } from './admin.js';
import type { AgentConfig } from './agent.js';
import type { AIConfig } from './ai.js';
import type { CollectionConfig } from './collection.js';
import type { ConnectionsConfig, CredentialSource } from './connections.js';
import type { DatabaseAdapter } from './database.js';
import type { Endpoint } from './endpoint.js';
import type { PayloadConfig } from './payload.js';
import type { Piece } from './piece.js';
import type { Plugin } from './plugin.js';
import type { FrogbotRequest } from './request.js';
import type { SettingsEntry } from './settings.js';
import type { AnyTool } from './tool.js';

type PayloadAfterErrorHook = NonNullable<NonNullable<PayloadConfig['hooks']>['afterError']>[number];

export type AfterErrorHook = (
  args: Omit<Parameters<PayloadAfterErrorHook>[0], 'req'> & { req: FrogbotRequest },
) => ReturnType<PayloadAfterErrorHook>;

export type RootHooks = {
  afterError?: AfterErrorHook[];
};

export type RolesPrewiring = {
  present?: true;
  configured?: boolean;
  roles?: string[];
};

/** Root config keys FrogBot overrides or forbids. Excluded from the
 *  Payload pass-through so FrogBot can declare its own shape for them. */
type FrogbotOverridden =
  | 'admin'
  | 'collections'
  | 'db'
  | 'endpoints'
  | 'globals'
  | 'hooks'
  | 'onInit'
  | 'plugins'
  | 'secret';

export type OnInit = (frogbot: Frogbot) => Promise<void> | void;

export type FrogbotConfig = Omit<PayloadConfig, FrogbotOverridden> & {
  /** Server-side secret used for tokens, cookies, and signing. */
  secret: string;
  /** Database adapter from a third-party package. */
  db: DatabaseAdapter;
  /** Collections authored with FrogBot's `CollectionConfig`. */
  collections: CollectionConfig[];
  /** Agent configs registered at boot and exposed via frogbot.agents. */
  agents?: AgentConfig[];
  /** Pieces — bundled tools, triggers, and auth for a third-party service. */
  pieces?: Piece[];
  /** Standalone tools available to agents, outside of any piece. */
  tools?: readonly AnyTool[];
  /** Third-party account linking — which providers users can connect. */
  connections?: ConnectionsConfig;
  /** Where connection credentials are read from and written to. */
  credentialSources?: CredentialSource[];
  /** Plugin pipeline — runs serially, in order, before sanitization. */
  plugins?: Plugin[];
  /** Pages added to the admin settings area, each with its own route. */
  settings?: SettingsEntry[];
  /** Root-level admin configuration. */
  admin?: RootAdminConfig;
  /** Root-level custom endpoints. Handler receives FrogbotRequest. */
  endpoints?: Endpoint[];
  /** Root-level hooks. `req` is `FrogbotRequest`. */
  hooks?: RootHooks;
  /** Runs once after FrogBot boots, with the initialized instance. */
  onInit?: OnInit | OnInit[];
  /** AI configuration — providers, routers, hooks, and access control. */
  ai?: AIConfig;
  /** Internal. Set by plugin-roles; not authored by users. */
  _roles?: RolesPrewiring;
};
