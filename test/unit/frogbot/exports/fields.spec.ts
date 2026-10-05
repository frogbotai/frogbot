import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const srcPath = resolve('packages/frogbot/src');
const entryPath = resolve(srcPath, 'exports/fields.ts');
const rootBarrelPath = resolve(srcPath, 'index.ts');

type RuntimeImport = { from: string; specifier: string };

function runtimeSpecifiers(source: string): string[] {
  const statements = source.matchAll(
    /^(?:import|export)\s+(type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/gm,
  );

  return [...statements].filter((match) => !match[1]).map((match) => match[2]);
}

function toSourcePath(from: string, specifier: string): string {
  return resolve(dirname(from), specifier).replace(/\.js$/, '.ts');
}

function collectRuntimeImports(): { files: string[]; imports: RuntimeImport[] } {
  const seen = new Set<string>();
  const imports: RuntimeImport[] = [];
  const pending = [entryPath];

  while (pending.length > 0) {
    const file = pending.pop() as string;

    if (seen.has(file)) continue;

    seen.add(file);

    runtimeSpecifiers(readFileSync(file, 'utf8')).forEach((specifier) => {
      imports.push({ from: file, specifier });

      if (specifier.startsWith('.')) pending.push(toSourcePath(file, specifier));
    });
  }

  return { files: [...seen], imports };
}

describe('frogbot/fields entry', () => {
  const { files, imports } = collectRuntimeImports();

  it('reaches the formatter source', () => {
    expect(files).toContain(resolve(srcPath, 'fields/baseFields/money/formatMoney.ts'));
  });

  it('imports only relative files at runtime', () => {
    expect(imports.filter(({ specifier }) => !specifier.startsWith('.'))).toEqual([]);
  });

  it('never reaches the root barrel', () => {
    expect(files).not.toContain(rootBarrelPath);
  });
});
