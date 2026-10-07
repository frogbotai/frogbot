import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { spawnServer } from './process';

const RUN_E2E = process.env.RUN_E2E === '1';
const repoRoot = resolve(import.meta.dirname, '..', '..');

function runInFixture(fixtureDir: string, args: string[]) {
  return new Promise<{ code: number; output: string }>((resolveExit) => {
    const child = spawnServer(process.execPath, args, {
      cwd: fixtureDir,
      env: {
        ...process.env,
        OPENAI_API_KEY: 'sk-e2e-dummy',
        FROGBOT_SECRET: 'e2e-secret',
        DATABASE_URL: 'file:./next-client-build.db',
      },
    });

    let output = '';
    child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.on('close', (code) => resolveExit({ code: code ?? 1, output }));
  });
}

describe.skipIf(!RUN_E2E)('@frogbotai/next client build', () => {
  it.each([
    ['blank template', join(repoRoot, 'templates', 'blank')],
    ['rich-text fixture', join(repoRoot, 'test', 'e2e', 'fixtures', 'rich-text')],
  ])(
    'builds the %s client graph',
    async (_name, fixtureDir) => {
      const buildDir = join(fixtureDir, '.next');
      rmSync(buildDir, { recursive: true, force: true });
      const require = createRequire(join(fixtureDir, 'package.json'));
      const nextBin = require.resolve('next/dist/bin/next');
      const generation = await runInFixture(fixtureDir, [
        join(repoRoot, 'packages', 'frogbot', 'bin.js'),
        'generate:importmap',
      ]);

      const result = await runInFixture(fixtureDir, [nextBin, 'build']);
      rmSync(buildDir, { recursive: true, force: true });

      expect(generation.code, generation.output).toBe(0);
      expect(result.code, result.output).toBe(0);
      expect(result.output).not.toMatch(/packages\/gateway\/.*\nCritical dependency/);
    },
    240000,
  );
});
