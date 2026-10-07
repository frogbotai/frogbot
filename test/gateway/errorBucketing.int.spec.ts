import type { ImageModelV4, LanguageModelV4 } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { postJson } from '../__helpers/gateway/post-json.js';

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
    get supportedUrls() {
      return Promise.resolve({});
    },
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

  it('maps InvalidToolInputError to a client-attributable 4xx (not 500)', async () => {
    const error = stampAiSdkError(
      'AI_InvalidToolInputError',
      'Invalid input for tool get_weather.',
    );

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
