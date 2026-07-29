import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const docsPath = new URL('../../../../docs/plugins/api-keys.mdx', import.meta.url);
const readmePath = new URL('../README.md', import.meta.url);

describe('api keys documentation', () => {
  it.each([
    ['documentation page', docsPath],
    ['package README', readmePath],
  ])('documents import-map generation for the %s', async (_name, path) => {
    const content = await readFile(path, 'utf8');

    expect(content).toContain('frogbot dev');
    expect(content).toContain('frogbot generate:importmap');
    expect(content).toMatch(/build|start/);
  });
});
