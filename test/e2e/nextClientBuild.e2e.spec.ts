import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const RUN_E2E = process.env.RUN_E2E === '1';
const repoRoot = resolve(import.meta.dirname, '..', '..');

describe.skipIf(!RUN_E2E)('@frogbotai/next client build', () => {
  it('builds the blank template with FolderTypeField in the generated import map', async () => {
    const templateDir = join(repoRoot, 'templates', 'blank');
    const buildDir = join(templateDir, '.next');
    rmSync(buildDir, { recursive: true, force: true });
    const require = createRequire(join(templateDir, 'package.json'));
    const nextBin = require.resolve('next/dist/bin/next');
    const result = await new Promise<{ code: number; output: string }>((resolveExit) => {
      const child = spawn(process.execPath, [nextBin, 'build'], {
        cwd: templateDir,
        env: {
          ...process.env,
          OPENAI_API_KEY: 'sk-e2e-dummy',
          FROGBOT_SECRET: 'e2e-secret',
          DATABASE_URL: 'file:./next-client-build.db',
        },
      });
      let output = '';
      child.stdout.on('data', (chunk: Buffer) => (output += chunk));
      child.stderr.on('data', (chunk: Buffer) => (output += chunk));
      child.on('close', (code) => resolveExit({ code: code ?? 1, output }));
    });
    rmSync(buildDir, { recursive: true, force: true });

    expect(result.code, result.output).toBe(0);
  }, 240000);
});
