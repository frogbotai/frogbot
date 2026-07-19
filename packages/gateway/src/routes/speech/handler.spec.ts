import { MockProviderV4, MockSpeechModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app.js';
import type { ProviderRegistry } from '../../providers/registry.js';

describe('speechRoute', () => {
  it('serves POST /v1/audio/speech with buffered audio bytes', async () => {
    const audio = new Uint8Array([1, 2, 3]);
    const doGenerate = vi.fn(async () => ({
      audio,
      warnings: [],
      response: { id: 'resp-1', timestamp: new Date(0), modelId: 'tts-1' },
    }));
    const app = createApp({
      registry: {
        openai: new MockProviderV4({ speechModels: { 'tts-1': new MockSpeechModelV4({ doGenerate }) } }),
      } as unknown as ProviderRegistry,
    });

    const res = await app.request('/v1/audio/speech', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/tts-1',
        input: 'Hello from Frogbot',
        voice: 'alloy',
        response_format: 'wav',
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/wav');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(audio);
    expect(doGenerate).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Hello from Frogbot',
      voice: 'alloy',
      outputFormat: 'wav',
    }));
  });

  it('maps content type from the requested response_format', async () => {
    const app = createApp({
      registry: {
        openai: new MockProviderV4({
          speechModels: {
            'tts-1': new MockSpeechModelV4({
              doGenerate: async () => ({
                audio: new Uint8Array([1]),
                warnings: [],
                response: { id: 'resp-1', timestamp: new Date(0), modelId: 'tts-1' },
              }),
            }),
          },
        }),
      } as unknown as ProviderRegistry,
    });

    const res = await app.request('/v1/audio/speech', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai/tts-1', input: 'Hello', voice: 'alloy' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
  });

  it('surfaces upstream warnings to hooks and response headers', async () => {
    const warning = { type: 'other' as const, message: 'speech warning' };
    const afterUpstream = vi.fn();
    const app = createApp({
      registry: {
        openai: new MockProviderV4({
          speechModels: {
            'tts-1': new MockSpeechModelV4({
              doGenerate: async () => ({
                audio: new Uint8Array([1]),
                warnings: [warning],
                response: { id: 'resp-1', timestamp: new Date(0), modelId: 'tts-1' },
              }),
            }),
          },
        }),
      } as unknown as ProviderRegistry,
      hooks: { afterUpstream: [afterUpstream] },
    });

    const res = await app.request('/v1/audio/speech', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai/tts-1', input: 'Hello', voice: 'alloy' }),
    });

    expect(res.status).toBe(200);
    expect(JSON.parse(res.headers.get('x-gateway-warnings') ?? '[]')).toEqual([warning]);
    expect(afterUpstream).toHaveBeenCalledWith(expect.objectContaining({ warnings: [warning] }));
  });
});
