import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);

    if (entry.isDirectory()) {
      return ['node_modules', '.next', 'dist'].includes(entry.name) ? [] : sourceFiles(file);
    }

    return entry.isFile() && /\.(mdx?|[cm]?[jt]sx?|jsonc?)$/.test(entry.name) ? [file] : [];
  });
}

describe('GraphQL documentation and opt-in boundaries', () => {
  it('documents route files that import only the public FrogBot config and route handlers', () => {
    const source = readFileSync(join(repoRoot, 'docs/graphql/enable.mdx'), 'utf8');
    const routes = [...source.matchAll(/```ts title="src\/app\/[^"]+\/route\.ts"\n([\s\S]*?)```/g)];

    expect(routes).toHaveLength(2);

    for (const [, code] of routes) {
      const imports = [...code.matchAll(/from ['"]([^'"]+)['"]/g)].map(
        ([, specifier]) => specifier,
      );

      expect(imports).toEqual(['@frogbot-config', '@frogbotai/next/routes']);
    }
  });

  it('ships the blank template without GraphQL route folders', () => {
    const folders = readdirSync(join(repoRoot, 'templates/blank/src/app/(frogbot)/api'));

    expect(folders.filter((folder) => folder.startsWith('graphql'))).toEqual([]);
  });

  it('keeps the obsolete config environment variable out of docs and template files', () => {
    const paths = ['docs', 'templates/blank'].flatMap((directory) =>
      sourceFiles(join(repoRoot, directory)),
    );
    const obsoleteReferences = paths.filter((file) =>
      readFileSync(file, 'utf8').includes('PAYLOAD_CONFIG_PATH'),
    );

    expect(obsoleteReferences).toEqual([]);
  });
});
