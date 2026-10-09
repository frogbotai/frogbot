import {
  createGoogleVertex,
  type GoogleVertexProvider,
  type GoogleVertexProviderSettings,
} from '@ai-sdk/google-vertex';
import {
  createGoogleVertexAnthropic,
  type GoogleVertexAnthropicProvider,
} from '@ai-sdk/google-vertex/anthropic';

import { ConfigError } from '../../errors/gatewayError.js';
import { readEnv } from '../../shared/runtimeDetection.js';
import type { ProviderDefinition } from '../types.js';
import { isVertexAnthropicModel } from './models.js';

export type VertexConfig = Omit<GoogleVertexProviderSettings, 'fetch' | 'generateId'> & {
  /** Claude on Vertex. `location` overrides the shared one, since some Claude models don't serve `global`. */
  anthropic?: { location?: string };
};

function buildAnthropic(cfg: VertexConfig): GoogleVertexAnthropicProvider {
  const project = cfg.project ?? readEnv('GOOGLE_VERTEX_PROJECT');
  const location = cfg.anthropic?.location ?? cfg.location ?? readEnv('GOOGLE_VERTEX_LOCATION');

  if (!project || !location) {
    throw new ConfigError([
      'providers.vertex needs a project and a location for Claude models: set project and location (or anthropic.location), or GOOGLE_VERTEX_PROJECT and GOOGLE_VERTEX_LOCATION',
    ]);
  }

  return createGoogleVertexAnthropic({
    project,
    location,
    headers: cfg.headers,
    googleAuthOptions: { projectId: project, ...cfg.googleAuthOptions },
  });
}

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
  build: (cfg) => {
    const { anthropic: _, ...settings } = cfg;
    const gemini = createGoogleVertex(settings);
    let claude: GoogleVertexAnthropicProvider | undefined;

    const languageModel: GoogleVertexProvider['languageModel'] = (modelId) => {
      if (!isVertexAnthropicModel(`vertex/${modelId}`)) return gemini.languageModel(modelId);

      claude ??= buildAnthropic(cfg);

      return claude.languageModel(modelId);
    };

    const provider = ((modelId: string) => languageModel(modelId)) as GoogleVertexProvider;

    return Object.assign(provider, gemini, { languageModel });
  },
} satisfies ProviderDefinition<'vertex', VertexConfig, GoogleVertexProvider>;
