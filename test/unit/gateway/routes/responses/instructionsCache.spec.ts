import { describe, expect, it } from 'vitest';

import { withInstructionsCache } from '../../../../../packages/gateway/src/routes/responses/instructionsCache.js';

describe('withInstructionsCache', () => {
  it('adds a Bedrock cache point for Claude on Bedrock', () => {
    expect(
      withInstructionsCache(
        'Be terse.',
        'bedrock',
        'global.anthropic.claude-haiku-4-5-20251001-v1:0',
      ),
    ).toEqual({
      role: 'system',
      content: 'Be terse.',
      providerOptions: { bedrock: { cachePoint: { type: 'default' } } },
    });
  });

  it('adds an ephemeral cacheControl for Claude on Anthropic', () => {
    expect(withInstructionsCache('Be terse.', 'anthropic', 'claude-haiku-4-5')).toEqual({
      role: 'system',
      content: 'Be terse.',
      providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
    });
  });

  it('leaves non-Claude models and empty instructions alone', () => {
    expect(withInstructionsCache('Be terse.', 'openai', 'gpt-5.6')).toBe('Be terse.');
    expect(withInstructionsCache('Be terse.', 'bedrock', 'amazon.nova-pro-v1:0')).toBe('Be terse.');
    expect(withInstructionsCache(undefined, 'anthropic', 'claude-haiku-4-5')).toBeUndefined();
  });
});
