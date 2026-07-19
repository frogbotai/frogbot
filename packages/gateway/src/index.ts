// Public surface of the `@frogbotai/gateway` package.
//
// Kept deliberately lean (FILE_STRUCTURE §3): factory + config + hook types +
// model catalog type. Errors live behind `./errors`, hook composition behind
// `./hooks`. Config/provider/catalog internals are implementation details and
// are imported directly by the CLI and routes — never re-exported here.

// Gateway factory — the primary entry point
export { createGateway } from './gateway.js';
export type { Gateway, GatewayOperation, GatewayOperationOptions } from './gateway.js';

// Config
export { defineConfig } from './config/schema.js';
export type { GatewayConfig } from './config/schema.js';

// Hook lifecycle types (also available via the `./hooks` subpath)
export type {
  Hooks,
  HookOperation,
  HookPhase,
  HookUsage,
  BeforeOperationHook,
  BeforeUpstreamHook,
  AfterUpstreamHook,
  AfterErrorHook,
  AfterOperationHook,
} from './hooks.js';

// Model catalog types — powers GET /v1/models discovery and operation validation
export type {
  Operation,
  Modality,
  ModelCapabilities,
  ModelCatalog,
  ModelCatalogEntry,
  ModelContext,
} from './providers/catalog.js';
