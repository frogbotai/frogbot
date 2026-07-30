// AI module barrel — internal use only.

export { AIAccessError,enforceAIAccess, methodToCategory } from './access.js';
export { catalog,getAllModelIds, getFilteredCatalog, isKnownModelId } from './catalog.js';
export type { CatalogModelId, ProviderSlug } from './generated.js';
export { toGatewayHooks, toHookUsage } from './hooks.js';
export { buildGatewayConfig, createAIGateway } from './init.js';
export { resolveModel } from './resolve.js';
