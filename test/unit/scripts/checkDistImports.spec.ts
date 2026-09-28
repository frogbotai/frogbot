import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkDistImports } from '../../../scripts/check-dist-imports.mjs';

type Problem = { file: string; specifier: string };

let dir: string;

function write(file: string, contents: string) {
  const target = join(dir, file);

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function manifest(fields: Record<string, unknown> = {}) {
  write('package.json', JSON.stringify({ name: 'fixture', version: '1.0.0', ...fields }));
}

function check(): Problem[] {
  return (
    checkDistImports({ packages: [{ dir, name: 'fixture', version: '1.0.0' }] }) as Problem[]
  ).map(({ file, specifier }) => ({ file: file.slice(dir.length + 1), specifier }));
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'check-dist-imports-'));
});

afterEach(() => {
  rmSync(dir, { force: true, recursive: true });
});

describe('checkDistImports', () => {
  it('reports an import whose file name differs only in letter case', () => {
    manifest();
    write('dist/getFrogbot.js', 'export const getFrogBot = () => {};\n');
    write('dist/index.js', "export { getFrogBot } from './getFrogBot.js';\n");

    const problems = check();

    expect(problems).toEqual([{ file: 'dist/index.js', specifier: './getFrogBot.js' }]);
  });

  it('passes imports and entry points that match file names exactly', () => {
    manifest({ exports: { '.': { import: './dist/index.js', types: './dist/index.d.ts' } } });
    write('dist/getFrogBot.js', 'export const getFrogBot = () => {};\n');
    write('dist/getFrogBot.d.ts', 'export declare const getFrogBot: () => void;\n');
    write(
      'dist/index.js',
      [
        "import './styles.css';",
        "import {\n  getFrogBot,\n} from './getFrogBot.js';",
        "export * from './getFrogBot.js';",
        "const lazy = () => import('./getFrogBot.js');",
        'const template = "import { assistant } from \'./agents/assistant\';";',
        "import { z } from 'zod';",
        '',
      ].join('\n'),
    );
    write('dist/index.d.ts', "export { getFrogBot } from './getFrogBot.js';\n");
    write('dist/styles.css', '');

    const problems = check();

    expect(problems).toEqual([]);
  });

  it('resolves a .js specifier in a declaration file to its declaration', () => {
    manifest();
    write('dist/getFrogbot.d.ts', 'export declare const getFrogBot: () => void;\n');
    write('dist/index.d.ts', "export { getFrogBot } from './getFrogBot.js';\n");

    const problems = check();

    expect(problems).toEqual([{ file: 'dist/index.d.ts', specifier: './getFrogBot.js' }]);
  });

  it('reports dynamic imports and requires of missing files', () => {
    manifest();
    write(
      'dist/index.js',
      "await import('../dist/Missing.js');\nconst x = require('./gone.cjs');\n",
    );

    const problems = check();

    expect(problems).toEqual([
      { file: 'dist/index.js', specifier: '../dist/Missing.js' },
      { file: 'dist/index.js', specifier: './gone.cjs' },
    ]);
  });

  it('reports a published entry point whose letter case does not match', () => {
    manifest({
      bin: { fixture: './bin.js' },
      exports: { './config': './dist/exports/Config.js', './icons/*': './dist/icons/*.js' },
      publishConfig: { main: './dist/Index.js' },
    });
    write('bin.js', '');
    write('dist/index.js', '');
    write('dist/exports/config.js', '');

    const problems = check();

    expect(problems).toEqual([
      { file: 'package.json', specifier: './dist/Index.js' },
      { file: 'package.json', specifier: './dist/exports/Config.js' },
    ]);
  });

  it('checks imports in bin files outside dist', () => {
    manifest({ bin: { fixture: './bin.js' } });
    write('bin.js', "import './dist/Index.js';\n");
    write('dist/index.js', '');

    const problems = check();

    expect(problems).toEqual([{ file: 'bin.js', specifier: './dist/Index.js' }]);
  });

  it('skips packages without build output', () => {
    manifest();

    const problems = check();

    expect(problems).toEqual([]);
  });
});
