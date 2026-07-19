// AI module barrel — internal use only.

export { buildGatewayConfig, createAIGateway } from './init.js';
export { resolveModel } from './resolve.js';
export { enforceAIAccess, methodToCategory, AIAccessError } from './access.js';
export { toGatewayHooks, toHookUsage } from './hooks.js';
export { getFilteredCatalog, getAllModelIds, isKnownModelId, catalog } from './catalog.js';
export type { CatalogModelId, ProviderSlug } from './generated.js';
