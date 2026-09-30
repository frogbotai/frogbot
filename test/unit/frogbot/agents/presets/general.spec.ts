import { describe, expect, it } from 'vitest';

import { general } from '../../../../../packages/frogbot/src/agents/presets/general.js';

describe('general', () => {
  it('offers every configured chat model without tools', () => {
    expect(general()).toEqual({
      model: { options: '*' },
      slug: 'general',
      instructions: 'You are a concise and helpful general assistant.',
    });
  });

  it('replaces the wildcard with an object model override', () => {
    const model = { default: 'openai/gpt-4o-mini', options: ['openai/gpt-4o'] } as const;

    const agent = general({ model });

    expect(agent.model).toEqual(model);
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
