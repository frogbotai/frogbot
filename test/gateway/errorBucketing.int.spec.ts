// AI SDK error bucketing is not exhaustive vs the current class list.
//
// G25 (HE2): normalizeAiSdkError / envelope.ts:295-324 maps exactly 7 classes
// plus a catch-all. Any AISDKError subclass NOT in that list falls through to
// the generic branch (envelope.ts:323-324) → `500 server_error` with
// `code: null`. That masks actionable failures:
//   - NoImageGeneratedError (images route) → should be 502/actionable, not 500
//   - InvalidToolInputError (tool-call family) → client-attributable 4xx, not 500
//
// MOCK tier — no live angle: Zen's free chat/reasoning models won't throw
// these specific SDK error classes on demand, so the branch is exercised by
// stamping a plain error with the class's detection marker (the same technique
// secretRedaction.int.spec.ts uses for APICallError). `AISDKError.hasMarker`
// only checks `Symbol.for('vercel.ai.error.<Name>') === true`, so a stamped
// error hits the exact `isInstance` branch.

import { describe, expect, it } from 'vitest';
import type { ImageModelV4, LanguageModelV4 } from '@ai-sdk/provider';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { postJson } from '../__helpers/gateway/post-json.js';

// Every AISDKError subclass carries the base `vercel.ai.error` marker plus its
// own `vercel.ai.error.<Name>` marker; `hasMarker` checks only the specific
// one. Stamp both so the error is indistinguishable from a real instance at
// the envelope's `isInstance` seam.
function stampAiSdkError(name: string, message: string): Error {
  return Object.assign(new Error(message), {
    name,
    [Symbol.for('vercel.ai.error')]: true,
    [Symbol.for(`vercel.ai.error.${name}`)]: true,
  });
}

function createThrowingImageModel(error: Error): ImageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-image-model',
    maxImagesPerCall: 1,
    doGenerate: () => Promise.reject(error),
  };
}

function createThrowingLanguageModel(error: Error): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    defaultObjectGenerationMode: undefined,
    get supportedUrls() { return Promise.resolve({}); },
    doGenerate: () => Promise.reject(error),
    doStream: () => Promise.reject(error),
  } as LanguageModelV4;
}

function makeImagesApp(error: Error) {
  const fakeProvider = { imageModel: () => createThrowingImageModel(error) };
  const registry = { openai: fakeProvider } as unknown as ProviderRegistry;
  return createApp({ registry });
}

function makeChatApp(error: Error) {
  const fakeProvider = { languageModel: () => createThrowingLanguageModel(error) };
  const registry = { openai: fakeProvider } as unknown as ProviderRegistry;
  return createApp({ registry });
}

describe('gateway integration — AI SDK error bucketing (G25)', () => {
  // A client hits /v1/images/generations and the SDK raises
  // NoImageGeneratedError (an upstream fault — the provider returned nothing
  // usable). The finding says this should surface as an actionable upstream
  // 502, not an opaque 500 "Internal server error" with a null code.
  it('maps NoImageGeneratedError to an actionable upstream status (not 500)', async () => {
    const error = stampAiSdkError('AI_NoImageGeneratedError', 'No image generated.');
    const app = makeImagesApp(error);

    const { status, body } = await postJson(app, '/v1/images/generations', {
      model: 'openai/gpt-image-1',
      prompt: 'a cat',
    });

    expect(status).toBe(502);
    expect(body).toHaveProperty('error.code');
    expect((body as { error: { code: unknown } }).error.code).not.toBeNull();
  });

  // A client hits /v1/chat/completions and the SDK raises InvalidToolInputError
  // (the model produced tool input that failed schema validation — a
  // client-attributable fault). The finding says this belongs in the 4xx
  // family, not a generic 500 server_error.
  it('maps InvalidToolInputError to a client-attributable 4xx (not 500)', async () => {
    const error = stampAiSdkError('AI_InvalidToolInputError', 'Invalid input for tool get_weather.');
    const app = makeChatApp(error);

    const { status, body } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
    expect((body as { error: { code: unknown } }).error.code).not.toBeNull();
  });
});
