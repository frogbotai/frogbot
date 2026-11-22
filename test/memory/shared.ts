import type { CatalogModelId } from 'frogbot';

import { testPort } from '../__helpers/shared/testPorts.js';

export const usersSlug = 'users';
export const embedderModel = 'embedder';
export const embeddingModel = `test/${embedderModel}` as CatalogModelId;
export const dimensions = 3;
export const modelPort = testPort(3115);
