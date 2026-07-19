import type { Experimental_VideoModelV4 } from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app.js';
import type { ProviderRegistry } from '../../providers/registry.js';

describe('videosRoute', () => {
  it('serves POST /v1/videos/generations', async () => {
    const doGenerate = vi.fn(async () => ({
      videos: [{ type: 'base64' as const, data: 'dmlkZW8=', mediaType: 'video/mp4' }],
      warnings: [],
      providerMetadata: {},
      response: { timestamp: new Date(), modelId: 'wan-2.5', headers: {} },
    }));
    const model = {
      specificationVersion: 'v4',
      provider: 'replicate.video',
      modelId: 'wan-2.5',
      maxVideosPerCall: 1,
      doGenerate,
    } satisfies Experimental_VideoModelV4;
    const app = createApp({
      registry: {
        replicate: { videoModel: () => model },
      } as unknown as ProviderRegistry,
    });

    const res = await app.request('/v1/videos/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'replicate/wan-2.5',
        prompt: 'a frog robot waving',
        n: 1,
        response_format: 'b64_json',
      }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      model: 'replicate/wan-2.5',
      data: [{ b64_json: 'dmlkZW8=' }],
    });
    expect(doGenerate).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'a frog robot waving',
      n: 1,
    }));
  });

  it('returns typed 400 for response_format url', async () => {
    const model = {
      specificationVersion: 'v4',
      provider: 'replicate.video',
      modelId: 'wan-2.5',
      maxVideosPerCall: 1,
      doGenerate: vi.fn(),
    } satisfies Experimental_VideoModelV4;
    const app = createApp({
      registry: {
        replicate: { videoModel: () => model },
      } as unknown as ProviderRegistry,
    });

    const res = await app.request('/v1/videos/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'replicate/wan-2.5',
        prompt: 'a frog robot waving',
        response_format: 'url',
      }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: {
        type: 'invalid_request_error',
        code: 'invalid_request_body',
        param: 'response_format',
      },
    });
    expect(model.doGenerate).not.toHaveBeenCalled();
  });

  it('surfaces upstream warnings to hooks and response headers', async () => {
    const warning = { type: 'other' as const, message: 'video warning' };
    const afterUpstream = vi.fn();
    const model = {
      specificationVersion: 'v4',
      provider: 'replicate.video',
      modelId: 'wan-2.5',
      maxVideosPerCall: 1,
      doGenerate: vi.fn(async () => ({
        videos: [{ type: 'base64' as const, data: 'dmlkZW8=', mediaType: 'video/mp4' }],
        warnings: [warning],
        providerMetadata: {},
        response: { timestamp: new Date(), modelId: 'wan-2.5', headers: {} },
      })),
    } satisfies Experimental_VideoModelV4;
    const app = createApp({
      registry: {
        replicate: { videoModel: () => model },
      } as unknown as ProviderRegistry,
      hooks: { afterUpstream: [afterUpstream] },
    });

    const res = await app.request('/v1/videos/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'replicate/wan-2.5',
        prompt: 'a frog robot waving',
        response_format: 'b64_json',
      }),
    });

    expect(res.status).toBe(200);
    expect(JSON.parse(res.headers.get('x-gateway-warnings') ?? '[]')).toEqual([warning]);
    expect(afterUpstream).toHaveBeenCalledWith(expect.objectContaining({ warnings: [warning] }));
  });
});
