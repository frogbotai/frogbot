import { describe, expect, it } from 'vitest';

import { resolveSmallModel } from '../../../../packages/frogbot/src/ai/models.js';
import type { AIConfig } from '../../../../packages/frogbot/src/ai/types.js';

function ai(overrides: Partial<AIConfig> = {}): AIConfig {
  return { providers: { openai: true }, ...overrides } as AIConfig;
}

describe('resolveSmallModel', () => {
  it('honors the configured utility model', () => {
    expect(
      resolveSmallModel(ai({ smallModel: 'openai/gpt-5-mini' as never }), 'openai/gpt-5.4'),
    ).toBe('openai/gpt-5-mini');
  });

  it('prefers a small model from the main provider', () => {
    expect(resolveSmallModel(ai(), 'openai/gpt-5.4')).toMatch(/^openai\/.+(nano|mini)/);
  });

  it('never crosses providers', () => {
    expect(
      resolveSmallModel(
        ai({ providers: { anthropic: true, openai: true } }),
        'anthropic/claude-opus-4-6',
      ),
    ).toMatch(/^anthropic\//);
  });

  it('honors provider model allowlists', () => {
    expect(
      resolveSmallModel(
        ai({ providers: { openai: { apiKey: 'test', models: ['gpt-5-mini'] } } }),
        'openai/gpt-5.4',
      ),
    ).toBe('openai/gpt-5-mini');
  });

  it('falls back to the main model for custom providers', () => {
    const config = ai({
      providers: {
        internal: {
          type: 'openai-compatible',
          baseUrl: 'https://models.test',
          models: [{ id: 'chat', mode: 'chat' }],
        },
      },
    });

    expect(resolveSmallModel(config, 'internal/chat')).toBe('internal/chat');
  });
});
