import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { writeToken } from '../../../../packages/plugins/plugin-dojo/src/cli/auth.js';
import { startFakeDojo } from './fakeDojo.js';
import { tempDir, writeApp, writeFiles } from './helpers.js';

const core = vi.hoisted(() => ({ blocked: true, imported: [] as string[] }));
const loadEnvConfig = vi.hoisted(() => vi.fn());

type LoadEnvConfig = (dir: string, dev?: boolean, log?: unknown, forceReload?: boolean) => unknown;

vi.mock('@next/env', async (importOriginal) => {
  const { default: actual } = await importOriginal<{ default: { loadEnvConfig: LoadEnvConfig } }>();

  loadEnvConfig.mockImplementation((...args: Parameters<LoadEnvConfig>) =>
    args[3] ? actual.loadEnvConfig(...args) : undefined,
  );

  return { default: { ...actual, loadEnvConfig } };
});

function guard(name: string) {
  return async (importOriginal: () => Promise<Record<string, unknown>>) => {
    core.imported.push(name);

    if (core.blocked) throw new Error(`${name} was imported`);

    return importOriginal();
  };
}

vi.mock('frogbot', guard('frogbot'));
vi.mock('payload', guard('payload'));
vi.mock('payload/shared', guard('payload/shared'));

vi.mock('frogbot/internal', async () => ({
  ...(await guard('frogbot/internal')(
    async () => import('../../../../packages/frogbot/src/config/resolveConfigPath.js'),
  )),
  ...(await import('../../../../packages/frogbot/src/collections/config/internal.js')),
  ...(await import('../../../../packages/frogbot/src/bin/formatCliError.js')),
  ...(await import('../../../../packages/frogbot/src/bin/deploy/error.js')),
  ...(await import('../../../../packages/frogbot/src/bin/deploy/io.js')),
  ...(await import('../../../../packages/frogbot/src/bin/deploy/run.js')),
  loadConfig: () => Promise.resolve({ _internal: { payloadConfig: { collections: [], db: {} } } }),
}));

const execFileAsync = promisify(execFile);

const lines = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls
    .map(([text]) => String(text))
    .join('')
    .split('\n')
    .filter(Boolean);

async function setup() {
  const cwd = await tempDir();
  const dojo = await startFakeDojo();
  const env = { XDG_CONFIG_HOME: await tempDir(), FROGBOT_DOJO_URL: dojo.url };

  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);

  vi.spyOn(process, 'cwd').mockReturnValue(cwd);

  dojo.apps.push({ id: 7, name: 'deals', slug: 'deals', workspace: 1 });
  dojo.level = 'editor';
  dojo.tokens.set('fb_stored', 100);
  await writeToken(env, dojo.url, 'fb_stored');

  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

  const run = async (...args: string[]) => {
    process.argv = ['node', 'frogbot-dojo', ...args];

    const { bin } = await import('../../../../packages/plugins/plugin-dojo/src/cli/bin.js');

    await bin();

    return process.exitCode;
  };

  return { cwd, dojo, env, run, stdout, stderr };
}

describe('npx @frogbotai/plugin-dojo', () => {
  const argv = process.argv;

  beforeEach(() => {
    vi.resetModules();
    core.blocked = true;
    core.imported.length = 0;
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.argv = argv;
    process.exitCode = undefined;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('with no app here, never importing frogbot or payload', () => {
    it('pulls an app into a new folder', async () => {
      const { cwd, dojo, run } = await setup();
      const source = await tempDir();

      await writeFiles(source, { 'package.json': '{"name":"deals"}', 'src/page.tsx': '1;' });

      await execFileAsync('tar', ['-czf', join(source, 'source.tar.gz'), 'package.json', 'src'], {
        cwd: source,
        env: { ...process.env, COPYFILE_DISABLE: '1' },
      });

      dojo.source = await readFile(join(source, 'source.tar.gz'));

      expect(await run('apps', 'pull', 'deals')).toBe(0);
      expect(dojo.paths()).toEqual([
        'GET /api/users/me',
        'GET /api/apps/deals/cli',
        'GET /api/apps/7/source',
      ]);
      expect(await readFile(join(cwd, 'deals/src/page.tsx'), 'utf8')).toBe('1;');
      expect(core.imported).toEqual([]);
      expect(loadEnvConfig).toHaveBeenCalledWith(cwd, true);
    });

    it('prints an app’s logs', async () => {
      const { dojo, run, stdout } = await setup();

      dojo.logs.push({ at: '2026-10-20T10:00:00Z', message: 'ready' });

      expect(await run('apps', 'logs', 'deals')).toBe(0);
      expect(lines(stdout)).toEqual(['2026-10-20T10:00:00Z ready']);
      expect(core.imported).toEqual([]);
    });

    it('signs out', async () => {
      const { dojo, env, run } = await setup();

      expect(await run('logout')).toBe(0);
      expect(dojo.paths()).toEqual(['GET /api/users/me', 'POST /api/api-keys/100/revoke']);
      await expect(stat(join(env.XDG_CONFIG_HOME, 'frogbotai/auth.json'))).rejects.toThrow();
      expect(core.imported).toEqual([]);
    });

    it('names itself in a usage line', async () => {
      const { run, stderr } = await setup();

      expect(await run('apps', 'pull')).toBe(2);
      expect(lines(stderr)).toEqual([
        '[frogbot] Usage: npx @frogbotai/plugin-dojo apps pull <app> [--data]',
      ]);
    });
  });

  it('shares an app that does not list dojo()', async () => {
    const { cwd, dojo, run } = await setup();

    core.blocked = false;
    dojo.apps.length = 0;
    await writeApp(cwd);

    expect(await run('apps', 'share', '--no-data')).toBe(0);
    expect(dojo.paths()).toContain('POST /api/apps/1/deployments');
    expect(core.imported).toContain('frogbot/internal');
  });

  it.each([[[]], [['nope']], [['share']]])('exits 2 listing the commands for %j', async (args) => {
    const { dojo, run, stderr } = await setup();

    expect(await run(...args)).toBe(2);
    expect(lines(stderr)).toEqual(
      expect.arrayContaining([
        'Usage: npx @frogbotai/plugin-dojo <command> [--json]',
        expect.stringMatching(/^ {2}apps +Share, pull/),
        expect.stringMatching(/^ {2}keys +/),
      ]),
    );
    expect(dojo.requests).toEqual([]);
  });

  it('lists a noun’s verbs with --help, and exits 2 on an unknown verb', async () => {
    const { dojo, run, stdout, stderr } = await setup();

    expect(await run('apps', '--help')).toBe(0);
    expect(lines(stdout)).toEqual(
      expect.arrayContaining([
        'Usage: npx @frogbotai/plugin-dojo apps <verb> [--json]',
        expect.stringMatching(/^ {2}share +/),
        expect.stringMatching(/^ {2}delete +/),
      ]),
    );

    expect(await run('apps', 'nope')).toBe(2);
    expect(lines(stderr)[0]).toBe('[frogbot] "nope" isn\'t a verb of apps.');
    expect(dojo.requests).toEqual([]);
  });

  it('shows a verb’s flags with --help', async () => {
    const { run, stdout } = await setup();

    expect(await run('apps', 'delete', '--help')).toBe(0);
    expect(lines(stdout)).toEqual(
      expect.arrayContaining([
        'Usage: npx @frogbotai/plugin-dojo apps delete <app> [--yes] [--json]',
        expect.stringMatching(/^ {2}--yes +Skip the confirmation/),
      ]),
    );
  });
});
