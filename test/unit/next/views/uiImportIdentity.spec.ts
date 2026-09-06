import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const viewsPath = resolve('packages/next/src/views');
const files = readdirSync(viewsPath, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.client.tsx'))
  .map((entry) => resolve(entry.parentPath, entry.name));

describe('client view UI imports', () => {
  it.each(files)('%s does not mix root and element or icon runtime imports', (file) => {
    const source = readFileSync(file, 'utf8');
    const hasRootImport = /from ['"]@payloadcms\/ui['"]/.test(source);
    const hasBundledSubpathImport = /from ['"]@payloadcms\/ui\/(?:elements|icons)\//.test(source);

    expect(hasRootImport && hasBundledSubpathImport).toBe(false);
  });
});
