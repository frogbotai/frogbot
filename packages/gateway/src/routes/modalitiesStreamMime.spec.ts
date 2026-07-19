// Modalities P2 findings that require ai-test provider mocks (G76, G78).
//
// These live as a COLOCATED UNIT spec because the ai-test mock helpers
// (MockProviderV4, MockSpeechModelV4, MockTranscriptionModelV4) only resolve
// in the vitest unit project; the int project cannot import them. This mirrors
// the colocated routes handler specs that use the same mock helpers.
//
// G76 — Transcriptions: the stream flag is silently ignored, yielding buffered
//        JSON instead of an event-stream response. The schema has no stream
//        field and the handler never streams.
// G78 — Speech: the response Content-Type is driven by AI SDK magic-byte
//        detection, NOT the requested response_format. pcm has no signature so
//        it falls back to audio/mp3; the IANA name for mp3 is audio/mpeg. The
//        handler forwards result.audio.mediaType verbatim (speech/handler.ts:135).
//
// Each failing case is tagged // G## and marks a CONFIRMED bug; flip on fix.

import { describe, expect, it } from 'vitest';
import { MockProviderV4, MockSpeechModelV4, MockTranscriptionModelV4 } from 'ai/test';

import { createApp } from '../app.js';
import type { ProviderRegistry } from '../providers/registry.js';

// ---------------------------------------------------------------------------
// G76 — transcriptions stream=true silently ignored (returns JSON, not SSE)
// ---------------------------------------------------------------------------

describe('G76 — transcriptions: stream=true silently ignored', () => {
  // G76 — the AI SDK's transcribe() has no streaming interface, so the gateway
  // rejects stream=true with a typed 400 rather than silently returning buffered
  // JSON (the previous behavioral lie). SSE streaming is deferred until the AI
  // SDK provides a doStream() surface for transcription models.
  it(
    'POST /v1/audio/transcriptions with stream=true is rejected with a 400',
    async () => {
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
    },
  );
});

// ---------------------------------------------------------------------------
// G78 — speech Content-Type matches requested outputFormat
// ---------------------------------------------------------------------------

describe('G78 — speech Content-Type matches requested outputFormat', () => {
  // G78 — pcm has no magic-byte signature → generateSpeech falls back to
  // audio/mp3 (generate-speech.ts) → handler forwards it (speech/handler.ts:135).
  // Requested response_format:pcm should yield audio/pcm.
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
      body: JSON.stringify({ model: 'openai/tts-1', input: 'Hello', voice: 'alloy', response_format: 'pcm' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/pcm');
  });

  // G78 — mp3 IANA type is audio/mpeg. detectMediaType only matches MPEG
  // frame-sync bytes (0xff 0xfb/...), NOT the ID3 tag (0x49 0x44 0x33), so
  // detection misses → fallback audio/mp3. Gateway should map mp3 → audio/mpeg.
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
      body: JSON.stringify({ model: 'openai/tts-1', input: 'Hello', voice: 'alloy', response_format: 'mp3' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
  });
});
