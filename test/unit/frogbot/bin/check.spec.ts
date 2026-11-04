import fs from 'node:fs/promises';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { check } from '../../../../packages/frogbot/src/bin/check.js';
import { loadConfig } from '../../../../packages/frogbot/src/config/load.js';
import { FrogBot } from '../../../../packages/frogbot/src/frogbot.js';
import { writeGeneratedTypes } from '../../../../packages/frogbot/src/typegen/index.js';

const buildURL = new URL('../../../../packages/frogbot/src/config/build.ts', import.meta.url).href;

const PASSED =
  '[frogbot] check passed. Not checked: TypeScript (run your typecheck script) and migrations (run `frogbot migrate:status`).';

type Fixture = { dir: string; typesPath: string };

async function makeFixture(config: string | ((dir: string) => string)): Promise<Fixture> {
  const dir = await mkdtemp(join(tmpdir(), 'frogbot-check-'));
  const configPath = join(dir, 'frogbot.config.ts');

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  await writeFile(
    configPath,
    `import { buildConfig } from ${JSON.stringify(buildURL)};\n\nexport default buildConfig({\n  secret: 'test-secret',\n  db: { defaultIDType: 'number' } as never,\n${typeof config === 'string' ? config : config(dir)}\n});\n`,
  );

  vi.stubEnv('FROGBOT_CONFIG_PATH', configPath);
  vi.spyOn(process, 'cwd').mockReturnValue(dir);

  return { dir, typesPath: join(dir, 'frogbot-types.ts') };
}

async function writeTypes({ dir }: Fixture): Promise<void> {
  await writeGeneratedTypes(await loadConfig({ cwd: dir, mode: 'runtime' }), dir);
}

const USERS = "  collections: [{ slug: 'users', auth: true, fields: [] }],";

async function runCheck(args: string[] = []) {
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const writeFileSpy = vi.spyOn(fs, 'writeFile');

  await check(args);

  expect(console.log).toBe(log);

  const exitCode = process.exitCode ?? 0;
  const result = {
    exitCode,
    stderr: error.mock.calls.map((call) => call.join(' ')),
    stdout: [
      ...log.mock.calls.map((call) => call.join(' ')),
      ...stdout.mock.calls.map(([chunk]) => String(chunk).trimEnd()),
    ],
    writes: writeFileSpy.mock.calls.length,
  };

  stdout.mockRestore();
  log.mockRestore();
  error.mockRestore();
  writeFileSpy.mockRestore();

  return result;
}

describe('frogbot check', () => {
  let exitCode: typeof process.exitCode;

  beforeEach(() => {
    exitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = exitCode;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('passes a clean config, writing nothing and creating no FrogBot instance', async () => {
    const fixture = await makeFixture(USERS);
    await writeTypes(fixture);
    const init = vi.spyOn(FrogBot.prototype, 'init');

    const result = await runCheck();

    expect(result).toEqual({ exitCode: 0, stderr: [], stdout: [PASSED], writes: 0 });
    expect(init).not.toHaveBeenCalled();
  });

  it('reports an unconfigured model ID as CONFIG_INVALID', async () => {
    await makeFixture(
      `${USERS}\n  ai: { providers: { anthropic: { apiKey: 'sk-test' } } },\n  agents: [{ slug: 'assistant', model: 'openai/gpt-4o-mini', instructions: 'Assist.' }],`,
    );

    const result = await runCheck();

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toEqual([]);
    expect(result.writes).toBe(0);
    expect(result.stderr).toEqual([
      expect.stringMatching(/^\[frogbot\] CONFIG_INVALID .*openai\/gpt-4o-mini/s),
      '[frogbot] 1 issue found',
    ]);
  });

  it('reports a duplicate collection slug as CONFIG_INVALID', async () => {
    await makeFixture(
      "  collections: [{ slug: 'users', auth: true, fields: [] }, { slug: 'posts', fields: [] }, { slug: 'posts', fields: [] }],",
    );

    const result = await runCheck();

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toEqual([
      expect.stringMatching(/^\[frogbot\] CONFIG_INVALID .*posts/s),
      '[frogbot] 1 issue found',
    ]);
  });

  it('reports a bad task cron as INVALID_CRON with its path', async () => {
    await makeFixture(
      `${USERS}\n  jobs: { tasks: [{ slug: 'sendDigest', handler: () => ({ output: {} }), schedule: [{ cron: 'nope', queue: 'default' }] }] },`,
    );

    const result = await runCheck();

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toEqual([
      "[frogbot] INVALID_CRON jobs.tasks.sendDigest.schedule.0.cron: Task 'sendDigest' schedule 0 has an invalid cron expression: 'nope'.",
      '[frogbot] 1 issue found',
    ]);
  });

  it('reports types with one byte changed as TYPES_STALE', async () => {
    const fixture = await makeFixture(USERS);
    await writeTypes(fixture);
    const types = await readFile(fixture.typesPath, 'utf-8');
    await writeFile(fixture.typesPath, types.replace('interface', 'interfacE'));

    const result = await runCheck();

    expect(result).toMatchObject({
      exitCode: 1,
      stderr: [
        '[frogbot] TYPES_STALE frogbot-types.ts: out of date; run `frogbot generate:types`',
        '[frogbot] 1 issue found',
      ],
      writes: 0,
    });
  });

  it('reports a stale import map as IMPORT_MAP_STALE', async () => {
    const fixture = await makeFixture(
      (dir) =>
        `${USERS}\n  admin: { importMap: { importMapFile: ${JSON.stringify(join(dir, 'importMap.js'))} } } as never,`,
    );

    const importMapFile = join(fixture.dir, 'importMap.js');
    await writeFile(importMapFile, 'export const importMap = { stale: true };\n');
    await writeTypes(fixture);

    const result = await runCheck();

    expect(result).toMatchObject({
      exitCode: 1,
      stderr: [
        '[frogbot] IMPORT_MAP_STALE importMap.js: out of date; run `frogbot generate:importmap`',
        '[frogbot] 1 issue found',
      ],
      writes: 0,
    });
    await expect(readFile(importMapFile, 'utf-8')).resolves.toBe(
      'export const importMap = { stale: true };\n',
    );
  });

  it('writes one JSON object to stdout for a broken config, sending logs to stderr', async () => {
    await makeFixture(
      `${USERS}\n  ...(console.log('loading config') ?? {}),\n  jobs: { tasks: [{ slug: 'sendDigest', handler: () => ({ output: {} }), schedule: [{ cron: 'nope', queue: 'default' }] }] },`,
    );

    const result = await runCheck(['--json']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toEqual(['loading config']);
    expect(result.stdout).toHaveLength(1);
    expect(JSON.parse(result.stdout[0])).toEqual({
      command: 'check',
      success: false,
      error: {
        code: 'CHECK_FAILED',
        message: '1 issue found',
        issues: [
          {
            code: 'INVALID_CRON',
            path: 'jobs.tasks.sendDigest.schedule.0.cron',
            message: "Task 'sendDigest' schedule 0 has an invalid cron expression: 'nope'.",
          },
        ],
      },
    });
  });

  it('writes one JSON object to stdout for a clean config', async () => {
    const fixture = await makeFixture(USERS);
    await writeTypes(fixture);

    const result = await runCheck(['--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toHaveLength(1);
    expect(JSON.parse(result.stdout[0])).toEqual({ command: 'check', success: true });
  });
});
