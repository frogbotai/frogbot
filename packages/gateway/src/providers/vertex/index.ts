// Provider definition: Google Vertex AI.
//
// Supports two auth modes:
//   1. API-key express mode (`GOOGLE_VERTEX_API_KEY`) — simplest path.
//   2. ADC (`GOOGLE_VERTEX_PROJECT` + `GOOGLE_VERTEX_LOCATION`) — uses google-auth-library.
//
// Partial ADC creds (project or location alone) skip the provider — per the
// `fromEnv` contract, discovery never throws (G41).

import {
  createVertex,
  type GoogleVertexProvider,
  type GoogleVertexProviderSettings,
} from '@ai-sdk/google-vertex';

import type { ProviderDefinition } from '../types.js';

export type VertexConfig = Omit<GoogleVertexProviderSettings, 'fetch' | 'generateId'>;

export const vertexProvider = {
  name: 'vertex',
  envVars: [
    'GOOGLE_VERTEX_API_KEY',
    'GOOGLE_VERTEX_PROJECT',
    'GOOGLE_VERTEX_LOCATION',
  ],
  fromEnv: (env) => {
    // Express mode — API key only.
    if (env.GOOGLE_VERTEX_API_KEY) {
      return {
        apiKey: env.GOOGLE_VERTEX_API_KEY,
        ...(env.GOOGLE_VERTEX_LOCATION && { location: env.GOOGLE_VERTEX_LOCATION }),
        ...(env.GOOGLE_VERTEX_PROJECT && { project: env.GOOGLE_VERTEX_PROJECT }),
      };
    }

    // ADC mode — requires project + location.
    const project = env.GOOGLE_VERTEX_PROJECT;
    const location = env.GOOGLE_VERTEX_LOCATION;

    // Missing either (none at all, or a partial pair) — skip provider.
    // Discovery never throws (G41).
    if (!project || !location) return undefined;

    return { project, location };
  },
  build: (cfg) => createVertex(cfg),
} satisfies ProviderDefinition<'vertex', VertexConfig, GoogleVertexProvider>;
