import { readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { spawnServer } from './process';

const RUN_E2E = process.env.RUN_E2E === '1';
const repoRoot = resolve(import.meta.dirname, '..', '..');
const fixtureDir = join(repoRoot, 'test', 'e2e', 'fixtures', 'plugin-wrappers');
const buildDir = join(fixtureDir, '.next');
const require = createRequire(join(fixtureDir, 'package.json'));

function runFixtureCommand(args: string[]): Promise<{ code: number; output: string }> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    OPENAI_API_KEY: 'sk-e2e-dummy',
    FROGBOT_SECRET: 'e2e-secret',
    DATABASE_URL: 'file:./plugin-wrappers.browser.db',
  };

  delete env.NODE_PATH;

  return new Promise((resolveExit, reject) => {
    const child = spawnServer(process.execPath, args, { cwd: fixtureDir, env });
    let output = '';

    child.stdout?.on('data', (chunk: Buffer) => (output += chunk));
    child.stderr?.on('data', (chunk: Buffer) => (output += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolveExit({ code: code ?? 1, output }));
  });
}

describe.skipIf(!RUN_E2E)('plugin wrapper client build', () => {
  beforeEach(() => {
    rmSync(buildDir, { recursive: true, force: true });
  });

  afterEach(() => {
    rmSync(buildDir, { recursive: true, force: true });
  });

  it('builds generated wrapper imports without hoisted dependency resolution', async () => {
    const generation = await runFixtureCommand([
      join(repoRoot, 'packages', 'frogbot', 'bin.js'),
      'generate:importmap',
    ]);

    expect(generation.code, generation.output).toBe(0);

    const importMap = readFileSync(
      join(fixtureDir, 'src', 'app', '(frogbot)', 'admin', 'importMap.js'),
      'utf8',
    );
    const specifiers = [...importMap.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map(
      (match) => match[1],
    );

    const seoComponents = [
      ...importMap.matchAll(
        /import\s+\{\s*(\w+)\s+as\s+\w+\s*\}\s+from\s+['"]@frogbotai\/plugin-seo\/client['"]/g,
      ),
    ].map((match) => match[1]);

    const build = await runFixtureCommand([require.resolve('next/dist/bin/next'), 'build']);

    expect(build.code, build.output).toBe(0);
    expect(build.output).not.toContain("Can't resolve");
    expect(specifiers).toContain('@frogbotai/plugin-import-export/rsc');
    expect(specifiers.length).toBeGreaterThan(0);
    expect(specifiers.every((specifier) => specifier.startsWith('@frogbotai/'))).toBe(true);
    expect(seoComponents.sort()).toEqual([
      'MetaDescriptionComponent',
      'MetaImageComponent',
      'MetaTitleComponent',
      'OverviewComponent',
      'PreviewComponent',
    ]);
  }, 240000);
});
