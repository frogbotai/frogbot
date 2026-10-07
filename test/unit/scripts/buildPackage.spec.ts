import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, '../../..');
const script = path.join(root, 'scripts', 'build-package.mjs');

let workspace: string;

async function write(file: string, contents: string) {
  const target = path.join(workspace, file);

  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
}

async function fixture(name: string, dependencies: Record<string, string> = {}) {
  await write(
    `${name}/package.json`,
    JSON.stringify({ name, version: '1.0.0', type: 'module', devDependencies: dependencies }),
  );

  await write(
    `${name}/tsconfig.json`,
    JSON.stringify({
      extends: path.join(root, 'tsconfig.base.json'),
      compilerOptions: {
        outDir: './dist',
        rootDir: './src',
        jsx: 'react-jsx',
        declaration: true,
        declarationMap: true,
        sourceMap: true,
        noEmit: false,
      },
      include: ['src/**/*'],
    }),
  );
}

async function build(name: string, args: string[] = []) {
  return execFileAsync(process.execPath, [script, ...args], { cwd: path.join(workspace, name) })
    .then(({ stdout }) => ({ code: 0, output: stdout }))
    .catch((error: { code: number; stdout: string }) => ({
      code: error.code,
      output: error.stdout,
    }));
}

async function dist(name: string) {
  const entries = await readdir(path.join(workspace, name, 'dist'), { recursive: true });

  return entries.filter((entry) => path.extname(entry)).sort();
}

beforeEach(async () => {
  await mkdir(path.join(root, 'test', '.tmp'), { recursive: true });

  workspace = await mkdtemp(path.join(root, 'test', '.tmp', 'build-package-'));
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe('build-package', () => {
  it('emits JavaScript, declarations, source maps and listed assets from src', async () => {
    await fixture('app');
    await write('app/src/index.ts', "export { Button } from './Button.js';\n");

    await write(
      'app/src/Button.tsx',
      "'use client';\nimport type { ReactNode } from 'react';\n\nexport const Button = ({ children }: { children: ReactNode }) => <button>{children}</button>;\n",
    );

    await write('app/src/Button.css', 'button { color: red; }\n');

    expect(await build('app', ['--assets', 'css'])).toMatchObject({ code: 0 });

    const button = await readFile(path.join(workspace, 'app/dist/Button.js'), 'utf8');
    const map = JSON.parse(await readFile(path.join(workspace, 'app/dist/Button.js.map'), 'utf8'));

    expect(await dist('app')).toEqual([
      'Button.css',
      'Button.d.ts',
      'Button.d.ts.map',
      'Button.js',
      'Button.js.map',
      'index.d.ts',
      'index.d.ts.map',
      'index.js',
      'index.js.map',
    ]);
    expect(
      button.startsWith('\'use client\';\nimport { jsx as _jsx } from "react/jsx-runtime";'),
    ).toBe(true);
    expect(button.endsWith('//# sourceMappingURL=Button.js.map')).toBe(true);
    expect(map).toMatchObject({ file: 'Button.js', sources: ['../src/Button.tsx'] });
    expect(await readFile(path.join(workspace, 'app/dist/index.js'), 'utf8')).toContain(
      "export { Button } from './Button.js';",
    );
  });

  it('removes outputs of deleted sources and renames outputs whose source changed letter case', async () => {
    await fixture('app');
    await write('app/src/index.ts', 'export const a = 1;\n');
    await write('app/src/Old.ts', 'export const old = 1;\n');
    await write('app/src/nested/Gone.ts', 'export const gone = 1;\n');
    await build('app');

    await rm(path.join(workspace, 'app/src/Old.ts'));
    await rm(path.join(workspace, 'app/src/nested'), { recursive: true });
    await write('app/src/old.ts', 'export const old = 2;\n');

    expect(await build('app')).toMatchObject({ code: 0 });

    expect(await dist('app')).toEqual([
      'index.d.ts',
      'index.d.ts.map',
      'index.js',
      'index.js.map',
      'old.d.ts',
      'old.d.ts.map',
      'old.js',
      'old.js.map',
    ]);
  });

  it('emits every output again after dist is deleted', async () => {
    await fixture('app');
    await write('app/src/index.ts', 'export const a = 1;\n');
    await build('app');

    await rm(path.join(workspace, 'app/dist'), { recursive: true });

    expect(await build('app')).toMatchObject({ code: 0 });

    expect(await dist('app')).toEqual(['index.d.ts', 'index.d.ts.map', 'index.js', 'index.js.map']);
  });

  it('leaves outputs of unchanged sources untouched', async () => {
    await fixture('app');
    await write('app/src/index.ts', 'export const a = 1;\n');
    await write('app/src/other.ts', 'export const b = 1;\n');
    await build('app');

    const before = await stat(path.join(workspace, 'app/dist/other.js'));

    await write('app/src/index.ts', 'export const a = 2;\n');
    await build('app');

    const after = await stat(path.join(workspace, 'app/dist/other.js'));

    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(await readFile(path.join(workspace, 'app/dist/index.js'), 'utf8')).toContain('a = 2');
  });

  it('fails on a type error on every run until it is fixed', async () => {
    await fixture('app');
    await write('app/src/index.ts', "export const a: number = 'one';\n");

    const first = await build('app');
    const second = await build('app');

    expect(first.code).not.toBe(0);
    expect(second.code).not.toBe(0);
    expect(second.output).toContain('TS2322');
  });

  it('checks a package again when a workspace dependency changes its declarations', async () => {
    await fixture('dep');
    await fixture('app', { dep: 'workspace:*' });
    await mkdir(path.join(workspace, 'app/node_modules'), { recursive: true });
    await symlink(path.join(workspace, 'dep'), path.join(workspace, 'app/node_modules/dep'));

    await write(
      'dep/package.json',
      JSON.stringify({ name: 'dep', version: '1.0.0', type: 'module', types: './dist/index.d.ts' }),
    );

    await write('dep/src/index.ts', 'export const value: number = 1;\n');

    await write(
      'app/src/index.ts',
      "import { value } from 'dep';\n\nexport const doubled: number = value * 2;\n",
    );

    await build('dep');

    expect(await build('app')).toMatchObject({ code: 0 });

    await write('dep/src/index.ts', "export const value: string = 'one';\n");
    await build('dep');

    const result = await build('app');

    expect(result.code).not.toBe(0);
    expect(result.output).toContain('TS2362');
  });
});
