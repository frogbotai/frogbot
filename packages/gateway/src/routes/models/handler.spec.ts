import { MockProviderV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';

import { defineModelCatalog, presetFor } from '../../providers/catalog.js';
import type { ProviderRegistry } from '../../providers/registry.js';
import { modelsRoute } from './handler.js';

const model = presetFor<'openai/allowed' | 'openai/blocked'>();
const catalog = defineModelCatalog(
  model('openai/allowed', {
    name: 'Allowed',
    modalities: { input: ['text'], output: ['text'] },
    operations: ['chat.completions'],
    capabilities: {},
    context: { input: 1, output: 1 },
    providers: ['openai'],
  }),
  model('openai/blocked', {
    name: 'Blocked',
    modalities: { input: ['text'], output: ['text'] },
    operations: ['chat.completions'],
    capabilities: {},
    context: { input: 1, output: 1 },
    providers: ['openai'],
  }),
);

describe('modelsRoute', () => {
  it('lists only allowlisted models', async () => {
    const app = modelsRoute({
      registry: { openai: new MockProviderV4() } as unknown as ProviderRegistry,
      catalog,
      allowlists: new Map([['openai', new Set(['openai/allowed'])]]),
    });
    const response = await app.request('/models');
    const body = await response.json() as { data: Array<{ id: string }> };

    expect(body.data.map(({ id }) => id)).toEqual(['openai/allowed']);
  });
});
