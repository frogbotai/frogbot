import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const RUN_E2E = process.env.RUN_E2E === '1';
const repoRoot = resolve(import.meta.dirname, '..', '..');
const tempRoot = join(repoRoot, 'test', '.tmp');
const bin = join(repoRoot, 'packages', 'frogbot', 'bin.js');

function run(cwd: string, args: string[], nodeEnv: NodeJS.ProcessEnv['NODE_ENV'] = 'development') {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: nodeEnv };

  delete env.DATABASE_URL;
  delete env.FROGBOT_SECRET;
  delete env.RUN_ENV;
  delete env.RUN_DEVELOPMENT_ONLY;

  return new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolveExit, reject) => {
      const child = spawn(process.execPath, [bin, 'run', ...args], {
        cwd,
        env,
        timeout: 10_000,
        killSignal: 'SIGKILL',
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      child.on('error', reject);
      child.on('close', (code) => resolveExit({ code, stdout, stderr }));
    },
  );
}

describe.skipIf(!RUN_E2E)('frogbot run', () => {
  let project: string;

  beforeAll(() => mkdirSync(tempRoot, { recursive: true }));

  beforeEach(() => {
    project = mkdtempSync(join(tempRoot, 'frogbot-run-'));

    mkdirSync(join(project, 'src'));
    writeFileSync(join(project, 'package.json'), JSON.stringify({ type: 'module' }));
    writeFileSync(
      join(project, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          paths: { '@frogbot-config': ['./src/frogbot.config.ts'] },
        },
      }),
    );
    writeFileSync(
      join(project, 'src', 'frogbot.config.ts'),
      'const databaseURL = process.env.DATABASE_URL;\nexport default databaseURL;\n',
    );
    writeFileSync(join(project, '.env'), 'DATABASE_URL=from-env\n');
    writeFileSync(join(project, '.env.local'), 'DATABASE_URL=from-env-local\n');
  });

  afterEach(() => rmSync(project, { recursive: true, force: true }));

  it('loads env before resolving the config alias', async () => {
    writeFileSync(
      join(project, 'src', 'seed.ts'),
      "import config from '@frogbot-config';\nconsole.log(JSON.stringify({ config }));\n",
    );

    const result = await run(project, ['src/seed.ts']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(JSON.stringify({ config: 'from-env-local' }));
  });

  it('passes script arguments unchanged with the absolute script path', async () => {
    writeFileSync(
      join(project, 'src', 'args.ts'),
      'console.log(JSON.stringify({ file: process.argv[1], args: process.argv.slice(2) }));\n',
    );

    const result = await run(project, ['src/args.ts', 'a', '--b', 'c', '--help']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(
      JSON.stringify({
        file: join(project, 'src', 'args.ts'),
        args: ['a', '--b', 'c', '--help'],
      }),
    );
    expect(result.stdout + result.stderr).not.toContain('[frogbot] usage:');
  });

  it('runs plain JavaScript', async () => {
    writeFileSync(join(project, 'src', 'plain.mjs'), 'console.log(JSON.stringify("plain JS"));\n');

    const result = await run(project, ['src/plain.mjs']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(JSON.stringify('plain JS'));
  });

  it('preserves the script exit code', async () => {
    writeFileSync(join(project, 'src', 'exit.ts'), 'process.exit(3);\n');

    const result = await run(project, ['src/exit.ts']);

    expect(result.code).toBe(3);
  });

  it('runs a script whose path contains spaces', async () => {
    writeFileSync(join(project, 'src', 'with spaces.ts'), 'console.log("space path");\n');

    const result = await run(project, ['src/with spaces.ts']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('space path');
  });

  it('runs a script given by absolute path', async () => {
    const file = join(project, 'src', 'absolute.ts');

    writeFileSync(file, 'console.log(process.argv[1]);\n');

    const result = await run(project, [file]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(file);
  });

  it('passes runner-like flags through to the script', async () => {
    writeFileSync(
      join(project, 'src', 'flags.ts'),
      'console.log(JSON.stringify(process.argv.slice(2)));\n',
    );

    const result = await run(project, ['src/flags.ts', '--help', '--use-swc']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('["--help","--use-swc"]');
    expect(result.stdout + result.stderr).not.toContain('[frogbot] usage:');
  });

  it('loads production env without loading development env', async () => {
    writeFileSync(join(project, '.env.production'), 'RUN_ENV=production\n');
    writeFileSync(
      join(project, '.env.development'),
      'RUN_ENV=development\nRUN_DEVELOPMENT_ONLY=development\n',
    );
    writeFileSync(
      join(project, 'src', 'env.ts'),
      'console.log(JSON.stringify({ mode: process.env.RUN_ENV, development: process.env.RUN_DEVELOPMENT_ONLY ?? null }));\n',
    );

    const result = await run(project, ['src/env.ts'], 'production');

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('{"mode":"production","development":null}');
  });

  it('prints a script error and its stack with exit code 1', async () => {
    writeFileSync(join(project, 'src', 'throws.ts'), 'throw new Error("script failure");\n');

    const result = await run(project, ['src/throws.ts']);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('[frogbot] run failed: src/throws.ts');
    expect(result.stderr).toContain('Error: script failure');
    expect(result.stderr).toMatch(/at .*throws\.ts:1:/);
  });

  it('reports a missing file with exit code 1', async () => {
    const result = await run(project, ['src/missing.ts']);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('[frogbot] run: file not found: src/missing.ts');
  });

  it('prints run usage with exit code 2 when no file is provided', async () => {
    const result = await run(project, []);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('[frogbot] usage: frogbot run <file> [args...]');
  });

  it('exits successfully even when the script leaves an open handle', async () => {
    writeFileSync(
      join(project, 'src', 'timer.ts'),
      'setInterval(() => undefined, 1000);\nconsole.log(JSON.stringify("timer started"));\n',
    );

    const result = await run(project, ['src/timer.ts']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(JSON.stringify('timer started'));
  });
});
