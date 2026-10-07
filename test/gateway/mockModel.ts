// Typed builders for hand-rolled LanguageModelV4 mocks in the gateway int
// specs. They fill the fields the spec types require (every usage key, the
// `{ unified, raw }` finish reason) so a spec only writes what it checks.

import type {
  LanguageModelV3,
  LanguageModelV4,
  LanguageModelV4FinishReason,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';

type UsageInput = {
  inputTokens: Partial<LanguageModelV4Usage['inputTokens']>;
  outputTokens: Partial<LanguageModelV4Usage['outputTokens']>;
  raw?: LanguageModelV4Usage['raw'];
};

/** A full `LanguageModelV4Usage`; keys the caller leaves out are `undefined`. */
export function mockUsage({ inputTokens, outputTokens, raw }: UsageInput): LanguageModelV4Usage {
  return {
    inputTokens: {
      total: inputTokens.total,
      noCache: inputTokens.noCache,
      cacheRead: inputTokens.cacheRead,
      cacheWrite: inputTokens.cacheWrite,
    },
    outputTokens: {
      total: outputTokens.total,
      text: outputTokens.text,
      reasoning: outputTokens.reasoning,
    },
    ...(raw === undefined ? {} : { raw }),
  };
}

/** A `LanguageModelV4FinishReason`; `raw` defaults to `undefined`. */
export function finish(
  unified: LanguageModelV4FinishReason['unified'],
  raw?: string,
): LanguageModelV4FinishReason {
  return { unified, raw };
}

/** A `ReadableStream` that emits `parts` and closes. */
export function partStream(
  parts: readonly LanguageModelV4StreamPart[],
): ReadableStream<LanguageModelV4StreamPart> {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(part);

      controller.close();
    },
  });
}

/**
 * A `LanguageModelV4` with mock defaults. `doGenerate` and `doStream` reject
 * unless the caller supplies them.
 */
export function mockModel(
  overrides: Partial<Omit<LanguageModelV4, 'specificationVersion'>> = {},
): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    supportedUrls: {},
    doGenerate: () => Promise.reject(new Error('doGenerate not mocked')),
    doStream: () => Promise.reject(new Error('doStream not mocked')),
    ...overrides,
  };
}

/** Narrows a gateway chat model to the v4 spec the gateway builds today. */
export function asV4(model: LanguageModelV4 | LanguageModelV3): LanguageModelV4 {
  if (model.specificationVersion !== 'v4') {
    throw new Error(`expected a v4 language model, got ${model.specificationVersion}`);
  }

  return model;
}
