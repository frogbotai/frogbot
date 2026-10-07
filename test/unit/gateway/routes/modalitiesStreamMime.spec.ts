import { MockProviderV4, MockSpeechModelV4, MockTranscriptionModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../../../packages/gateway/src/providers/registry.js';

describe('G76 — transcriptions: stream=true silently ignored', () => {
  it('POST /v1/audio/transcriptions with stream=true is rejected with a 400', async () => {
    const registry = {
      openai: new MockProviderV4({
        transcriptionModels: {
          'whisper-1': new MockTranscriptionModelV4({
            doGenerate: () =>
              Promise.resolve({
                text: 'hello world',
                segments: [],
                language: 'en',
                durationInSeconds: 1,
                warnings: [],
                response: { id: 'r', timestamp: new Date(0), modelId: 'whisper-1' },
              }),
          }),
        },
      }),
    } as unknown as ProviderRegistry;

    const app = createApp({ registry });

    const form = new FormData();
    form.set('model', 'openai/whisper-1');
    form.set('file', new File([new Uint8Array([1, 2, 3])], 'audio.mp3', { type: 'audio/mpeg' }));
    form.set('stream', 'true');

    const res = await app.request('/v1/audio/transcriptions', { method: 'POST', body: form });

    expect(res.status).toBe(400);

    const body = (await res.json()) as { error?: { message?: string } };

    expect(body.error?.message).toContain('streaming transcription is not supported');
  });
});

describe('G78 — speech Content-Type matches requested outputFormat', () => {
  it('POST /v1/audio/speech with response_format:pcm returns Content-Type: audio/pcm', async () => {
    const registry = {
      openai: new MockProviderV4({
        speechModels: {
          'tts-1': new MockSpeechModelV4({
            doGenerate: () =>
              Promise.resolve({
                audio: new Uint8Array([0x00, 0x01, 0x02, 0x03]),
                warnings: [],
                response: { id: 'r', timestamp: new Date(0), modelId: 'tts-1' },
              }),
          }),
        },
      }),
    } as unknown as ProviderRegistry;

    const app = createApp({ registry });

    const res = await app.request('/v1/audio/speech', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/tts-1',
        input: 'Hello',
        voice: 'alloy',
        response_format: 'pcm',
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/pcm');
  });

  it('POST /v1/audio/speech with response_format:mp3 returns Content-Type: audio/mpeg', async () => {
    const registry = {
      openai: new MockProviderV4({
        speechModels: {
          'tts-1': new MockSpeechModelV4({
            doGenerate: () =>
              Promise.resolve({
                audio: new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]),
                warnings: [],
                response: { id: 'r', timestamp: new Date(0), modelId: 'tts-1' },
              }),
          }),
        },
      }),
    } as unknown as ProviderRegistry;

    const app = createApp({ registry });

    const res = await app.request('/v1/audio/speech', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/tts-1',
        input: 'Hello',
        voice: 'alloy',
        response_format: 'mp3',
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
  });
});
