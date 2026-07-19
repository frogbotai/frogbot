import type { Experimental_VideoModelV4 } from '@ai-sdk/provider';
import {
  MockEmbeddingModelV4,
  MockImageModelV4,
  MockProviderV4,
  MockRerankingModelV4,
  MockSpeechModelV4,
  MockTranscriptionModelV4,
} from 'ai/test';
import { describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { GatewayError } from '../errors/gatewayError.js';
import type { Hooks } from '../hooks.js';
import type { ProviderRegistry } from '../providers/registry.js';

type RouteCase = {
  name: string;
  path: string;
  buildApp: (args: { fail: boolean; hooks: Hooks }) => ReturnType<typeof createApp>;
  init: () => RequestInit;
};

const upstreamError = new Error('upstream failed');

function buildHooks(events: string[]): Hooks {
  return {
    beforeOperation: [() => events.push('beforeOperation')],
    beforeUpstream: [() => events.push('beforeUpstream')],
    afterUpstream: [() => events.push('afterUpstream')],
    afterError: [(args) => events.push(`afterError:${args.failedPhase}`)],
    afterOperation: [
      (args) => events.push(`afterOperation:${args.finishReason ?? 'none'}:${args.error ? 'error' : 'ok'}`),
    ],
  };
}

const cases: RouteCase[] = [
  {
    name: 'embeddings',
    path: '/v1/embeddings',
    buildApp: ({ fail, hooks }) =>
      createApp({
        hooks,
        registry: {
          openai: new MockProviderV4({
            embeddingModels: {
              'text-embedding-3-small': new MockEmbeddingModelV4({
                doEmbed: async ({ values }) => {
                  if (fail) {
                    throw upstreamError;
                  }
                  return {
                    embeddings: values.map(() => [1, 2]),
                    usage: { tokens: 3 },
                    warnings: [],
                  };
                },
              }),
            },
          }),
        } as unknown as ProviderRegistry,
      }),
    init: () => ({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/text-embedding-3-small',
        input: 'frog',
      }),
    }),
  },
  {
    name: 'images',
    path: '/v1/images/generations',
    buildApp: ({ fail, hooks }) =>
      createApp({
        hooks,
        registry: {
          openai: new MockProviderV4({
            imageModels: {
              'dall-e-3': new MockImageModelV4({
                doGenerate: async () => {
                  if (fail) {
                    throw upstreamError;
                  }
                  return {
                    images: ['aW1hZ2U='],
                    usage: { inputTokens: 1, outputTokens: 0, totalTokens: 1 },
                    warnings: [],
                  };
                },
              }),
            },
          }),
        } as unknown as ProviderRegistry,
      }),
    init: () => ({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai/dall-e-3', prompt: 'frog' }),
    }),
  },
  {
    name: 'speech',
    path: '/v1/audio/speech',
    buildApp: ({ fail, hooks }) =>
      createApp({
        hooks,
        registry: {
          openai: new MockProviderV4({
            speechModels: {
              'tts-1': new MockSpeechModelV4({
                doGenerate: async () => {
                  if (fail) {
                    throw upstreamError;
                  }
                  return {
                    audio: new Uint8Array([1]),
                    warnings: [],
                    response: {
                      id: 'resp-1',
                      timestamp: new Date(0),
                      modelId: 'tts-1',
                    },
                  };
                },
              }),
            },
          }),
        } as unknown as ProviderRegistry,
      }),
    init: () => ({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/tts-1',
        input: 'frog',
        voice: 'alloy',
      }),
    }),
  },
  {
    name: 'transcriptions',
    path: '/v1/audio/transcriptions',
    buildApp: ({ fail, hooks }) =>
      createApp({
        hooks,
        registry: {
          openai: new MockProviderV4({
            transcriptionModels: {
              'whisper-1': new MockTranscriptionModelV4({
                doGenerate: async () => {
                  if (fail) {
                    throw upstreamError;
                  }
                  return {
                    text: 'frog',
                    segments: [],
                    language: 'en',
                    durationInSeconds: 1,
                    warnings: [],
                    response: {
                      id: 'resp-1',
                      timestamp: new Date(0),
                      modelId: 'whisper-1',
                    },
                  };
                },
              }),
            },
          }),
        } as unknown as ProviderRegistry,
      }),
    init: () => {
      const form = new FormData();
      form.set('model', 'openai/whisper-1');
      form.set('file', new File([new Uint8Array([1])], 'audio.mp3', { type: 'audio/mpeg' }));
      return { method: 'POST', body: form };
    },
  },
  {
    name: 'videos',
    path: '/v1/videos/generations',
    buildApp: ({ fail, hooks }) => {
      const model = {
        specificationVersion: 'v4',
        provider: 'replicate.video',
        modelId: 'wan-2.5',
        maxVideosPerCall: 1,
        doGenerate: async () => {
          if (fail) {
            throw upstreamError;
          }
          return {
            videos: [
              {
                type: 'base64' as const,
                data: 'dmlkZW8=',
                mediaType: 'video/mp4',
              },
            ],
            warnings: [],
            providerMetadata: {},
            response: {
              timestamp: new Date(0),
              modelId: 'wan-2.5',
              headers: {},
            },
          };
        },
      } satisfies Experimental_VideoModelV4;

      return createApp({
        hooks,
        registry: {
          replicate: { videoModel: () => model },
        } as unknown as ProviderRegistry,
      });
    },
    init: () => ({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'replicate/wan-2.5', prompt: 'frog' }),
    }),
  },
  {
    name: 'rerank',
    path: '/v1/rerank',
    buildApp: ({ fail, hooks }) =>
      createApp({
        hooks,
        registry: {
          cohere: new MockProviderV4({
            rerankingModels: {
              'rerank-v3.5': new MockRerankingModelV4({
                doRerank: async () => {
                  if (fail) {
                    throw upstreamError;
                  }
                  return {
                    ranking: [{ index: 0, relevanceScore: 0.9 }],
                    warnings: [],
                    response: { id: 'rerank_123' },
                  };
                },
              }),
            },
          }),
        } as unknown as ProviderRegistry,
      }),
    init: () => ({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'cohere/rerank-v3.5',
        query: 'frog',
        documents: ['frog'],
      }),
    }),
  },
];

describe('modality handler operation runner', () => {
  it.each(cases)('sequences hooks for $name', async (route) => {
    const events: string[] = [];
    const app = route.buildApp({ fail: false, hooks: buildHooks(events) });

    const res = await app.request(route.path, route.init());

    expect(res.status).toBe(200);
    expect(events).toEqual(['beforeOperation', 'beforeUpstream', 'afterUpstream', 'afterOperation:none:ok']);
  });

  it.each(cases)('returns the shared error envelope for $name', async (route) => {
    const events: string[] = [];
    const app = route.buildApp({ fail: true, hooks: buildHooks(events) });

    const res = await app.request(route.path, route.init());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: {
        message: 'upstream failed',
        type: 'server_error',
        code: null,
        param: null,
      },
    });
    expect(events).toEqual(['beforeOperation', 'beforeUpstream', 'afterError:upstream', 'afterOperation:none:error']);
  });

  it('returns 499 with no body when the client aborts', async () => {
    // A client abort is a fetch-layer AbortError *with the inbound request
    // signal aborted* — a bare AbortError with a connected client is an
    // upstream fault (504), not a client abort (G86).
    const abortError = Object.assign(new Error('aborted'), {
      name: 'AbortError',
    });
    const controller = new AbortController();
    const app = cases[0].buildApp({
      fail: false,
      hooks: {
        beforeUpstream: [
          () => {
            controller.abort();
            throw abortError;
          },
        ],
      },
    });

    const res = await app.request(cases[0].path, {
      ...cases[0].init(),
      signal: controller.signal,
    });

    expect(res.status).toBe(499);
    expect(await res.text()).toBe('');
  });

  it('isolates throwing after* hooks — response and status stay intact', async () => {
    const events: string[] = [];
    const app = cases[0].buildApp({
      fail: false,
      hooks: {
        afterUpstream: [
          () => {
            throw new Error('boom afterUpstream');
          },
        ],
        afterOperation: [
          () => {
            throw new Error('boom afterOperation');
          },
          () => events.push('afterOperation:ran'),
        ],
      },
    });

    const res = await app.request(cases[0].path, cases[0].init());

    expect(res.status).toBe(200);
    // A throwing hook does not stop later hooks in the same phase.
    expect(events).toEqual(['afterOperation:ran']);
  });

  it('short-circuits before body parsing when beforeOperation throws', async () => {
    const events: string[] = [];
    const app = cases[0].buildApp({
      fail: false,
      hooks: {
        beforeOperation: [
          () => {
            events.push('beforeOperation');
            throw new GatewayError({
              message: 'forbidden',
              status: 403,
              code: 'invalid_request_body',
            });
          },
        ],
        beforeUpstream: [() => events.push('beforeUpstream')],
      },
    });

    const res = await app.request(cases[0].path, { method: 'POST', body: '{' });

    expect(res.status).toBe(403);
    expect(events).toEqual(['beforeOperation']);
  });
});
