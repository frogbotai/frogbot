import { describe, expect, it } from 'vitest';

import type { SanitizedAIConfig } from '../../../../../packages/frogbot/src/ai/types.js';
import { compactionCeiling } from '../../../../../packages/frogbot/src/chat/compaction/ceiling.js';
import { contextWindow } from '../../../../../packages/frogbot/src/chat/compaction/window.js';

const config = {
  providers: {
    anthropic: true,
    local: {
      type: 'openai-compatible',
      baseUrl: 'http://localhost:11434/v1',
      models: [
        { id: 'split', mode: 'chat', limit: { context: 200_000, input: 150_000 } },
        { id: 'context', mode: 'chat', limit: { context: 32_000 } },
        { id: 'plain', mode: 'chat' },
      ],
    },
  },
  routers: { fast: { model: 'local/context' } },
} as unknown as SanitizedAIConfig;

describe('contextWindow', () => {
  it.each([
    ['a catalog model', 'anthropic/claude-sonnet-4-5', 200_000],
    ['a custom model with limit.input', 'local/split', 150_000],
    ['a custom model with only limit.context', 'local/context', 32_000],
    ['a router to a custom model', 'fast', 32_000],
    ['a custom model without limits', 'local/plain', undefined],
    ['an unknown model', 'anthropic/not-a-model', undefined],
  ])('reads %s', (_, model, window) => {
    expect(contextWindow({ config, model })).toBe(window);
  });
});

describe('compactionCeiling', () => {
  it.each([
    ['a 200k window keeps 10%', 200_000, undefined, 180_000],
    ['a 100k window keeps 16,000', 100_000, undefined, 84_000],
    ['a 20k window keeps only 10%', 20_000, undefined, 18_000],
    ['a buffer replaces the reserve', 200_000, 50_000, 150_000],
    ['a zero buffer uses the whole window', 200_000, 0, 200_000],
    ['an unknown window has no ceiling', undefined, undefined, undefined],
  ])('%s', (_, window, buffer, ceiling) => {
    expect(compactionCeiling({ window, buffer })).toBe(ceiling);
  });
});
