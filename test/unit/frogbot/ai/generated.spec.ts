import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { renderAIModelTypes } from '../../../../scripts/generate-ai-types.mjs';
import catalog from '../../../../packages/frogbot/src/ai/catalog.json' with { type: 'json' };

describe('generated AI model types', () => {
  it('matches the canonical catalog', async () => {
    const generated = await readFile(
      new URL('../../../../packages/frogbot/src/ai/generated.ts', import.meta.url),
      'utf8',
    );

    expect(generated).toBe(await renderAIModelTypes(catalog));
  });

  it('contains current Anthropic models without retired IDs', () => {
    const ids = catalog.filter(({ provider }) => provider === 'anthropic').map(({ id }) => id);

    expect(ids).toContain('anthropic/claude-opus-4-8');
    expect(ids).not.toContain('anthropic/claude-3-5-sonnet-20241022');
  });

  it('contains invocable Bedrock profiles without broken bare IDs', async () => {
    const generated = await readFile(
      new URL('../../../../packages/frogbot/src/ai/generated.ts', import.meta.url),
      'utf8',
    );
    const profiles = [
      'global.amazon.nova-2-lite-v1:0',
      'us.meta.llama3-1-8b-instruct-v1:0',
      'us.meta.llama3-3-70b-instruct-v1:0',
    ];
    const bareIds = [
      'amazon.nova-2-lite-v1:0',
      'meta.llama3-1-8b-instruct-v1:0',
      'meta.llama3-3-70b-instruct-v1:0',
    ];
    const ids = catalog.map(({ id }) => id);

    for (const model of profiles) {
      expect(ids).toContain(`bedrock/${model}`);
      expect(generated).toContain(`'bedrock/${model}'`);
    }
    for (const model of bareIds) {
      expect(ids).not.toContain(`bedrock/${model}`);
      expect(generated).not.toContain(`'bedrock/${model}'`);
    }
  });
});
