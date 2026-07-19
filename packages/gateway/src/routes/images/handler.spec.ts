import { APICallError } from '@ai-sdk/provider';
import { MockImageModelV4, MockProviderV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app.js';
import type { ProviderRegistry } from '../../providers/registry.js';

describe('imagesRoute', () => {
  it('serves POST /v1/images/generations', async () => {
    const doGenerate = vi.fn(async () => ({
      images: ['aW1hZ2U='],
      usage: { inputTokens: 3, outputTokens: 0, totalTokens: 3 },
      warnings: [],
    }));
    const model = new MockImageModelV4({ maxImagesPerCall: 2, doGenerate });
    const app = createApp({
      registry: {
        openai: new MockProviderV4({ imageModels: { 'dall-e-3': model } }),
      } as unknown as ProviderRegistry,
    });

    const res = await app.request('/v1/images/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/dall-e-3',
        prompt: 'a frog robot',
        n: 1,
        size: '1024x1024',
        response_format: 'b64_json',
      }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: [{ b64_json: 'aW1hZ2U=' }],
    });
    expect(doGenerate).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'a frog robot',
      n: 1,
      size: '1024x1024',
    }));
  });

  it('returns typed 400 for response_format url', async () => {
    const app = createApp({
      registry: {
        openai: new MockProviderV4({ imageModels: { 'dall-e-3': new MockImageModelV4() } }),
      } as unknown as ProviderRegistry,
    });

    const res = await app.request('/v1/images/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/dall-e-3',
        prompt: 'a frog robot',
        response_format: 'url',
      }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: {
        param: 'response_format',
      },
    });
  });

  it('returns OpenAI-shaped content policy errors', async () => {
    const model = new MockImageModelV4({
      doGenerate: async () => {
        throw new APICallError({
          message: 'Request blocked by the safety policy.',
          url: 'https://api.example.test/v1/images/generations',
          requestBodyValues: {},
          statusCode: 400,
          data: {
            error: { message: 'Request blocked by the safety policy.', code: 'safety_blocked' },
          },
        });
      },
    });
    const app = createApp({
      registry: {
        openai: new MockProviderV4({ imageModels: { 'dall-e-3': model } }),
      } as unknown as ProviderRegistry,
    });

    const res = await app.request('/v1/images/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/dall-e-3',
        prompt: 'unsafe prompt',
        response_format: 'b64_json',
      }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: {
        type: 'invalid_request_error',
        code: 'content_policy_violation',
      },
    });
  });

  it('surfaces upstream warnings to hooks and response headers', async () => {
    const warning = { type: 'other' as const, message: 'image warning' };
    const afterUpstream = vi.fn();
    const model = new MockImageModelV4({
      doGenerate: async () => ({
        images: ['aW1hZ2U='],
        usage: { inputTokens: 3, outputTokens: 0, totalTokens: 3 },
        warnings: [warning],
      }),
    });
    const app = createApp({
      registry: {
        openai: new MockProviderV4({ imageModels: { 'dall-e-3': model } }),
      } as unknown as ProviderRegistry,
      hooks: { afterUpstream: [afterUpstream] },
    });

    const res = await app.request('/v1/images/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/dall-e-3',
        prompt: 'a frog robot',
        response_format: 'b64_json',
      }),
    });

    expect(res.status).toBe(200);
    expect(JSON.parse(res.headers.get('x-gateway-warnings') ?? '[]')).toEqual([warning]);
    expect(afterUpstream).toHaveBeenCalledWith(expect.objectContaining({ warnings: [warning] }));
  });
});
