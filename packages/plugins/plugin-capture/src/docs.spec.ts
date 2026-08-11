import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const docsPath = new URL('../../../../docs/plugins/capture.mdx', import.meta.url);
const navPath = new URL('../../../../docs/docs.json', import.meta.url);

describe('capture plugin docs', () => {
  it('documents installation, policy, storage, and retention in navigation', async () => {
    const [docs, nav] = await Promise.all([
      readFile(docsPath, 'utf8'),
      readFile(navPath, 'utf8'),
    ]);

    expect(docs).toContain('pnpm add @frogbotai/plugin-capture');
    expect(docs).toContain("plugins: [apiKeysPlugin(), capturePlugin()]");
    expect(docs).toContain('errors-only');
    expect(docs).toContain('retentionDays');
    expect(docs).toContain('storage');
    expect(nav).toContain('plugins/capture');
  });
});
