import {
  createVertex,
  type GoogleVertexProvider,
  type GoogleVertexProviderSettings,
} from '@ai-sdk/google-vertex';

import type { ProviderDefinition } from '../types.js';

export type VertexConfig = Omit<GoogleVertexProviderSettings, 'fetch' | 'generateId'>;

export const vertexProvider = {
  name: 'vertex',
  envVars: ['GOOGLE_VERTEX_API_KEY', 'GOOGLE_VERTEX_PROJECT', 'GOOGLE_VERTEX_LOCATION'],
  fromEnv: (env) => {
    if (env.GOOGLE_VERTEX_API_KEY) {
      return {
        apiKey: env.GOOGLE_VERTEX_API_KEY,
        ...(env.GOOGLE_VERTEX_LOCATION && { location: env.GOOGLE_VERTEX_LOCATION }),
        ...(env.GOOGLE_VERTEX_PROJECT && { project: env.GOOGLE_VERTEX_PROJECT }),
      };
    }

    const project = env.GOOGLE_VERTEX_PROJECT;
    const location = env.GOOGLE_VERTEX_LOCATION;

    if (!project || !location) return undefined;

    return { project, location };
  },
  build: (cfg) => createVertex(cfg),
} satisfies ProviderDefinition<'vertex', VertexConfig, GoogleVertexProvider>;
