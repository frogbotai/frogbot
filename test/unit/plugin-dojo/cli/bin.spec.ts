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
  loadConfig: () => Promise.resolve({ _internal: { payloadConfig: { collections: [], db: {} } } }),
}));

const execFileAsync = promisify(execFile);
const usage = '[frogbot] usage: npx @frogbotai/plugin-dojo <share|pull|logs|logout>';

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

  dojo.projects.push({ id: 7, name: 'deals', slug: 'deals', workspace: 1 });
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

      expect(await run('pull', 'deals')).toBe(0);
      expect(dojo.paths()).toEqual([
        'GET /api/users/me',
        'GET /api/apps/deals',
        'GET /api/apps/7/source',
      ]);
      expect(await readFile(join(cwd, 'deals/src/page.tsx'), 'utf8')).toBe('1;');
      expect(core.imported).toEqual([]);
      expect(loadEnvConfig).toHaveBeenCalledWith(cwd, true);
    });

    it('prints an app’s logs', async () => {
      const { dojo, run, stdout } = await setup();

      dojo.logs.push({ at: '2026-10-20T10:00:00Z', message: 'ready' });

      expect(await run('logs', 'deals')).toBe(0);
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

      expect(await run('pull')).toBe(2);
      expect(lines(stderr)).toEqual(['[frogbot] Usage: npx @frogbotai/plugin-dojo pull <app>']);
    });
  });

  it('shares an app that does not list dojo()', async () => {
    const { cwd, dojo, run } = await setup();

    core.blocked = false;
    dojo.projects.length = 0;
    await writeApp(cwd);

    expect(await run('share', '--no-data')).toBe(0);
    expect(dojo.paths()).toContain('POST /api/apps/1/deployments');
    expect(core.imported).toContain('frogbot/internal');
  });

  it.each([[[]], [['nope']]])('exits 2 with its usage for %j', async (args) => {
    const { dojo, run } = await setup();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });

    await expect(run(...args)).rejects.toThrow('exit:2');
    expect(error.mock.calls).toEqual([[usage]]);
    expect(dojo.requests).toEqual([]);
  });
});
