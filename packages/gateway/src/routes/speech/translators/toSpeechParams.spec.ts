import { describe, expect, it } from 'vitest';

import { toSpeechParams } from './toSpeechParams.js';

describe('toSpeechParams', () => {
  it('maps OpenAI speech request fields to AI SDK params', () => {
    expect(toSpeechParams({
      model: 'openai/tts-1',
      input: 'hello',
      voice: 'alloy',
      response_format: 'wav',
      speed: 1.2,
      instructions: 'calm',
      language: 'en',
      user: 'user-1',
    })).toEqual({
      text: 'hello',
      voice: 'alloy',
      outputFormat: 'wav',
      speed: 1.2,
      instructions: 'calm',
      language: 'en',
      providerOptions: {},
    });
  });

  it('defaults output format to mp3', () => {
    expect(toSpeechParams({
      model: 'openai/tts-1',
      input: 'hello',
      voice: 'alloy',
    }).outputFormat).toBe('mp3');
  });

  it.each(['openai', 'elevenlabs', 'lmnt', 'hume', 'fal', 'deepgram', 'google', 'xai'])(
    'does not leak user into speech provider options for %s',
    (providerName) => {
      expect(toSpeechParams({
        model: `${providerName}/speech-model`,
        input: 'hello',
        voice: 'alloy',
        user: 'user-1',
      }).providerOptions).toEqual({});
    },
  );
});
