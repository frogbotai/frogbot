import { MockProviderV4, MockTranscriptionModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app.js';
import type { ProviderRegistry } from '../../providers/registry.js';

describe('transcriptionsRoute', () => {
  it('serves POST /v1/audio/transcriptions', async () => {
    const doGenerate = vi.fn(async () => ({
      text: 'Hello from Frogbot',
      segments: [{ text: 'Hello from Frogbot', startSecond: 0, endSecond: 1.5 }],
      language: 'en',
      durationInSeconds: 1.5,
      warnings: [],
      response: { id: 'resp-1', timestamp: new Date(0), modelId: 'whisper-1' },
    }));
    const app = createApp({
      registry: {
        openai: new MockProviderV4({ transcriptionModels: { 'whisper-1': new MockTranscriptionModelV4({ doGenerate }) } }),
      } as unknown as ProviderRegistry,
    });
    const form = new FormData();
    form.set('model', 'openai/whisper-1');
    form.set('file', new File([new Uint8Array([1, 2, 3])], 'audio.mp3', { type: 'audio/mpeg' }));
    form.set('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');

    const res = await app.request('/v1/audio/transcriptions', {
      method: 'POST',
      body: form,
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      text: 'Hello from Frogbot',
      task: 'transcribe',
      language: 'en',
      duration: 1.5,
      words: [],
      segments: [{ id: 0, seek: 0, start: 0, end: 1.5, text: 'Hello from Frogbot', tokens: [] }],
    });
    expect(doGenerate).toHaveBeenCalledWith(expect.objectContaining({
      audio: new Uint8Array([1, 2, 3]),
      providerOptions: { openai: { timestampGranularities: ['segment'] } },
    }));
  });

  it('returns plain text for response_format text', async () => {
    const app = createApp({
      registry: {
        openai: new MockProviderV4({
          transcriptionModels: {
            'whisper-1': new MockTranscriptionModelV4({
              doGenerate: async () => ({
                text: 'plain transcript',
                segments: [],
                language: undefined,
                durationInSeconds: undefined,
                warnings: [],
                response: { id: 'resp-1', timestamp: new Date(0), modelId: 'whisper-1' },
              }),
            }),
          },
        }),
      } as unknown as ProviderRegistry,
    });
    const form = new FormData();
    form.set('model', 'openai/whisper-1');
    form.set('file', new File([new Uint8Array([1])], 'audio.wav', { type: 'audio/wav' }));
    form.set('response_format', 'text');

    const res = await app.request('/v1/audio/transcriptions', {
      method: 'POST',
      body: form,
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await res.text()).toBe('plain transcript');
  });

  it('rejects missing file, oversized bodies, and wrong content type', async () => {
    const app = createApp({
      registry: {
        openai: new MockProviderV4({ transcriptionModels: { 'whisper-1': new MockTranscriptionModelV4() } }),
      } as unknown as ProviderRegistry,
    });

    const noFile = new FormData();
    noFile.set('model', 'openai/whisper-1');
    const noFileRes = await app.request('/v1/audio/transcriptions', { method: 'POST', body: noFile });
    expect(noFileRes.status).toBe(400);
    expect(await noFileRes.json()).toHaveProperty('error.param', 'file');

    const oversizedRes = await app.request('/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'content-length': String(26 * 1024 * 1024) },
    });
    expect(oversizedRes.status).toBe(413);
    expect(await oversizedRes.json()).toHaveProperty('error.param', 'content-length');

    const wrongTypeRes = await app.request('/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai/whisper-1' }),
    });
    expect(wrongTypeRes.status).toBe(400);
    expect(await wrongTypeRes.json()).toHaveProperty('error.param', 'model');

    const emptyRes = await app.request('/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'content-length': '0' },
    });
    expect(emptyRes.status).toBe(400);
    expect(await emptyRes.json()).toHaveProperty('error.param', 'model');
  });
});
