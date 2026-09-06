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

  it.each(files)('%s only type-imports the payload root package', (file) => {
    const source = readFileSync(file, 'utf8');

    expect(/^import\s+(?!type\b)[^;]*from\s+['"]payload['"]/m.test(source)).toBe(false);
  });
});

describe('view controls admin styles', () => {
  it('uses admin runtime accent tokens', () => {
    const source = readFileSync(resolve(viewsPath, 'controls/ViewControls.css'), 'utf8');

    expect(source).toMatch(/--theme-success-150/);
    expect(source).toMatch(/--theme-success-250/);
    expect(source).toMatch(/--theme-success-800/);
    expect(source).not.toMatch(/--theme-base-/);
    expect(source).not.toMatch(/--color-blue-/);
  });
});
