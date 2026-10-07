import { createXai, type XaiProvider, type XaiProviderSettings } from '@ai-sdk/xai';

import type { ProviderDefinition } from '../types.js';

export type XaiConfig = Omit<XaiProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey?: string;
};

type GenerateResult = {
  finishReason: { unified: string; raw?: string };
  response?: { body?: unknown };
};

export function fixIncompleteFinishReason<
  M extends { doGenerate: (options: never) => PromiseLike<GenerateResult> },
>(model: M): M {
  return new Proxy(model, {
    get(target, prop, receiver) {
      if (prop !== 'doGenerate') return Reflect.get(target, prop, receiver);

      return async (options: Parameters<M['doGenerate']>[0]) => {
        const result = await target.doGenerate(options);
        if (result.finishReason.raw !== 'incomplete') return result;
        const reason = (result.response?.body as { incomplete_details?: { reason?: unknown } })
          ?.incomplete_details?.reason;

        const unified =
          reason === 'max_output_tokens'
            ? 'length'
            : reason === 'content_filter'
              ? 'content-filter'
              : undefined;

        return unified ? { ...result, finishReason: { ...result.finishReason, unified } } : result;
      };
    },
  });
}

export const xaiProvider = {
  name: 'xai',
  credentials: [{ apiKey: 'XAI_API_KEY' }],
  envVars: ['XAI_API_KEY', 'XAI_BASE_URL'],
  fromEnv: (env) => {
    if (!env.XAI_API_KEY) return undefined;

    return {
      apiKey: env.XAI_API_KEY,
      ...(env.XAI_BASE_URL && { baseURL: env.XAI_BASE_URL }),
    };
  },
  build: (cfg): XaiProvider => {
    const xai = createXai(cfg);
    const languageModel: XaiProvider['languageModel'] = (modelId) =>
      fixIncompleteFinishReason(xai.languageModel(modelId));

    const provider = ((modelId: Parameters<XaiProvider['languageModel']>[0]) =>
      languageModel(modelId)) as XaiProvider;

    return Object.assign(provider, xai, {
      languageModel,
      responses: languageModel,
    });
  },
} satisfies ProviderDefinition<'xai', XaiConfig, XaiProvider>;
