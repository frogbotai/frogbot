import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { renderAIModelTypes } from '../../../../scripts/generate-ai-types.mjs';
import catalog from './catalog.json' with { type: 'json' };

describe('generated AI model types', () => {
  it('matches the canonical catalog', async () => {
    const generated = await readFile(new URL('./generated.ts', import.meta.url), 'utf8');

    expect(generated).toBe(renderAIModelTypes(catalog));
  });

  it('contains current Anthropic models without retired IDs', () => {
    const ids = catalog.filter(({ provider }) => provider === 'anthropic').map(({ id }) => id);

    expect(ids).toContain('anthropic/claude-opus-4-8');
    expect(ids).not.toContain('anthropic/claude-3-5-sonnet-20241022');
  });
});
