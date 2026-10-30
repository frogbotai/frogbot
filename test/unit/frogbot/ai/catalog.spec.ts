import { describe, expect, it } from 'vitest';

import { methodForModel } from '../../../../packages/frogbot/src/ai/catalog.js';

describe('methodForModel', () => {
  it.each([
    ['openai/gpt-4.1', 'generateText'],
    ['openai/gpt-image-2', 'generateText'],
    ['openai/gpt-realtime-2.1', 'generateText'],
    ['xai/grok-imagine-video', 'generateText'],
    ['openai/text-embedding-3-small', 'embed'],
    ['openai/whisper-1', 'transcribe'],
    ['typesafe-ai/jev', 'evaluate'],
  ])('maps %s to %s', (id, method) => {
    expect(methodForModel(id)).toBe(method);
  });

  it('maps an ID outside the catalog to generateText', () => {
    expect(methodForModel('acme/unknown-model')).toBe('generateText');
  });
});
