import { describe, expect, it } from 'vitest';

import { general } from './general.js';

describe('general', () => {
  it('creates an unpinned general agent without tools', () => {
    expect(general()).toEqual({
      slug: 'general',
      instructions: 'You are a concise and helpful general assistant.',
    });
  });

  it('applies optional overrides while preserving core-owned fields', () => {
    const tools = [{ slug: 'search', description: 'Search', inputSchema: {} }];

    expect(
      general({
        slug: 'other',
        instructions: 'Other instructions',
        model: 'openai/test',
        tools,
      }),
    ).toEqual({
      slug: 'general',
      instructions: 'You are a concise and helpful general assistant.',
      model: 'openai/test',
      tools,
    });
  });
});
