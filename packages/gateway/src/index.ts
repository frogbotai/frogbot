// Public surface of the `@frogbotai/gateway` package.
//
// Kept deliberately lean (FILE_STRUCTURE §3): factory + config + hook types +
// model catalog type. Errors live behind `./errors`, hook composition behind
// `./hooks`. Config/provider/catalog internals are implementation details and
// are imported directly by the CLI and routes — never re-exported here.

// Gateway factory — the primary entry point
export type {
  Gateway,
  GatewayHandler,
  GatewayOperation,
  GatewayOperationOptions,
} from "./gateway.js";
export { createGateway } from "./gateway.js";

// Config
export type { GatewayConfig } from "./config/schema.js";
export { defineConfig } from "./config/schema.js";

// Hook lifecycle types (also available via the `./hooks` subpath)
export type {
  AfterErrorHook,
  AfterOperationHook,
  AfterUpstreamHook,
  BeforeOperationHook,
  BeforeUpstreamHook,
  HookOperation,
  HookPhase,
  Hooks,
  HookUsage,
} from "./hooks.js";

// Model catalog types — powers GET /v1/models discovery and operation validation
export type {
  Modality,
  ModelCapabilities,
  ModelCatalog,
  ModelCatalogEntry,
  ModelContext,
  ModelCost,
  Operation,
} from "./providers/catalog.js";
export { calculateCostUSD } from "./providers/catalog.js";
export { calculateModelCostUSD } from "./providers/cost.js";
