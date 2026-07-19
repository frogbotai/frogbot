// Provider definition: Hugging Face Inference.
//
// Supported subset: models hosted via HF Inference Endpoints that expose an
// OpenAI-compatible chat completions interface. Serverless Inference API models
// and custom pipeline models are NOT guaranteed to work.

import {
  createHuggingFace,
  type HuggingFaceProvider,
  type HuggingFaceProviderSettings,
} from '@ai-sdk/huggingface';

import type { ProviderDefinition } from '../types.js';

export type HuggingFaceConfig = Omit<HuggingFaceProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey: string;
};

export const huggingfaceProvider = {
  name: 'huggingface',
  requiredKeys: ['apiKey'],
  envVars: ['HUGGINGFACE_API_KEY', 'HUGGINGFACE_BASE_URL'],
  fromEnv: (env) => {
    if (!env.HUGGINGFACE_API_KEY) return undefined;
    return {
      apiKey: env.HUGGINGFACE_API_KEY,
      ...(env.HUGGINGFACE_BASE_URL && { baseURL: env.HUGGINGFACE_BASE_URL }),
    };
  },
  build: (cfg) => createHuggingFace(cfg),
} satisfies ProviderDefinition<'huggingface', HuggingFaceConfig, HuggingFaceProvider>;
