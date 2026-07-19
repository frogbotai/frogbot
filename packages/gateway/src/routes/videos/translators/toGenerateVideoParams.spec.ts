import { describe, expect, it } from 'vitest';

import { toGenerateVideoParams } from './toGenerateVideoParams.js';

describe('toGenerateVideoParams', () => {
  it('maps video generation fields to AI SDK params', () => {
    expect(toGenerateVideoParams({
      body: {
        model: 'replicate/wan-2.5',
        prompt: 'a frog robot waving',
        n: 1,
        aspect_ratio: '16:9',
        resolution: '1280x720',
        duration: 5,
        fps: 24,
        seed: 123,
        generate_audio: true,
        response_format: 'b64_json',
        poll_timeout_ms: 300000,
        poll_interval_ms: 2000,
        user: 'user-1',
      },
      providerName: 'replicate',
    })).toEqual({
      prompt: 'a frog robot waving',
      n: 1,
      aspectRatio: '16:9',
      resolution: '1280x720',
      duration: 5,
      fps: 24,
      seed: 123,
      generateAudio: true,
      providerOptions: {
        replicate: {
          pollTimeoutMs: 300000,
          pollIntervalMs: 2000,
        },
      },
    });
  });

  it('omits poll timeout unless requested', () => {
    expect(toGenerateVideoParams({
      body: {
        model: 'replicate/wan-2.5',
        prompt: 'a frog robot waving',
      },
      providerName: 'replicate',
    }).providerOptions).toEqual({});
  });

  it.each(['alibaba', 'bytedance', 'fal', 'google', 'klingai', 'prodia', 'replicate', 'vertex', 'xai'])(
    'scopes video provider options for %s',
    (providerName) => {
      expect(toGenerateVideoParams({
        body: {
          model: `${providerName}/video-model`,
          prompt: 'a frog robot waving',
          response_format: 'b64_json',
          poll_timeout_ms: 300000,
          poll_interval_ms: 2000,
          user: 'user-1',
        },
        providerName,
      }).providerOptions).toEqual({
        [providerName]: {
          pollTimeoutMs: 300000,
          pollIntervalMs: 2000,
        },
      });
    },
  );

  it('maps timeout_ms to pollTimeoutMs', () => {
    expect(toGenerateVideoParams({
      body: {
        model: 'replicate/wan-2.5',
        prompt: 'a frog robot waving',
        timeout_ms: 300000,
      },
      providerName: 'replicate',
    }).providerOptions).toEqual({ replicate: { pollTimeoutMs: 300000 } });
  });
});
