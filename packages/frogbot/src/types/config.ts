// FrogBot's root configuration shape — what users hand to `buildConfig`.
//
// Extends Payload's `Config`, replacing the collections array with FrogBot's
// `CollectionConfig`, the admin block with FrogBot's `RootAdminConfig`, and
// forbidding `globals` entirely. Everything else passes through.
//
// Users import this from `'frogbot'` and never see the underlying Payload
// type name or import path.

import type { PayloadConfig } from './payload.js';

import type { AgentConfig } from './agent.js';
import type { AIConfig } from './ai.js';
import type { RootAdminConfig } from './admin.js';
import type { CollectionConfig } from './collection.js';
import type { DatabaseAdapter } from './database.js';
import type { Endpoint } from './endpoint.js';
import type { Plugin } from './plugin.js';
import type { FrogbotRequest } from './request.js';

type PayloadAfterErrorHook = NonNullable<NonNullable<PayloadConfig['hooks']>['afterError']>[number];

export type AfterErrorHook = (
  args: Omit<Parameters<PayloadAfterErrorHook>[0], 'req'> & { req: FrogbotRequest },
) => ReturnType<PayloadAfterErrorHook>;

export type RootHooks = {
  afterError?: AfterErrorHook[];
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
  | 'plugins'
  | 'secret';

export type FrogbotConfig = Omit<PayloadConfig, FrogbotOverridden> & {
  /** Server-side secret used for tokens, cookies, and signing. */
  secret: string;
  /** Database adapter from a third-party package. */
  db: DatabaseAdapter;
  /** Collections authored with FrogBot's `CollectionConfig`. */
  collections: CollectionConfig[];
  /** Agent configs registered at boot and exposed via frogbot.agents. */
  agents?: AgentConfig[];
  /** Plugin pipeline — runs serially, in order, before sanitization. */
  plugins?: Plugin[];
  /** Root-level admin configuration. */
  admin?: RootAdminConfig;
  /** Root-level custom endpoints. Handler receives FrogbotRequest. */
  endpoints?: Endpoint[];
  hooks?: RootHooks;
  /** AI configuration — providers, routers, hooks, and access control. */
  ai?: AIConfig;
};
