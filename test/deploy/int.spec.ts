import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { DeployIO } from 'frogbot';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { deploy } from '../../packages/frogbot/src/bin/deploy/command.js';
import { deployTestConfig, seen, targetName } from './config.js';

let root: string;

async function writeApp(): Promise<void> {
  const files: Record<string, string> = {
    'package.json': '{"name":"deals"}',
    'pnpm-lock.yaml': '',
    Dockerfile: 'FROM node\n',
    '.env': 'FROGBOT_SECRET=secret\nDATABASE_URL=postgres://u:p@db.example.com/deals\n',
    'src/frogbot.config.ts': 'export default {};',
  };

  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
}

function fakeIO(config: Awaited<ReturnType<typeof deployTestConfig>>) {
  let out = '';
  let err = '';
  const ran: string[] = [];

  const io: DeployIO = {
    program: 'frogbot',
    cwd: root,
    env: {},
    isTTY: false,
    stdout: { write: (text: string) => (out += text) },
    stderr: { write: (text: string) => (err += text) },
    prompts: {
      confirm: () => Promise.reject(new Error('no prompts')),
      select: () => Promise.reject(new Error('no prompts')),
      multiselect: () => Promise.reject(new Error('no prompts')),
    },
    openBrowser: () => undefined,
    wait: () => Promise.resolve(),
    loadConfig: async () => await config._internal.payloadConfig,
    exec: (command, args) => {
      ran.push([command, ...args].join(' '));

      return Promise.resolve({ code: 0, stdout: '', stderr: '' });
    },
    which: () => Promise.resolve(true),
  };

  return { io, ran, stdout: () => out, stderr: () => err };
}

describe('frogbot deploy with a target registered through cli.deployTargets', () => {
  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'frogbot-deploy-int-')));
    seen.args = [];
    seen.ran = false;
    await writeApp();
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('runs the plugin target with the real loaded config', async () => {
    const config = await deployTestConfig({ migrations: true });
    const { io, ran, stdout } = fakeIO(config);

    expect(config.cli.deployTargets).toHaveProperty(targetName);
    expect(await deploy([targetName, '--json', '--region', 'x'], { config, io })).toBe(0);
    expect(seen).toMatchObject({ args: ['--region', 'x'], ran: true, database: 'sqlite' });
    expect(ran).toEqual(['host-cli deploy --app deals']);
    expect(JSON.parse(stdout())).toEqual({
      target: targetName,
      ok: true,
      dryRun: false,
      issues: [],
      result: { url: 'https://deals.test-host.dev' },
    });
  });

  it('reads prodMigrations from the real SQLite adapter for a core target', async () => {
    const { io, stderr } = fakeIO(await deployTestConfig({ migrations: false }));

    expect(
      await deploy(['docker', '--dry-run'], {
        config: await deployTestConfig({ migrations: false }),
        io,
      }),
    ).toBe(1);
    expect(stderr()).toContain(
      '[frogbot] MIGRATIONS_NOT_WIRED The database adapter has no `prodMigrations`',
    );

    const wired = fakeIO(await deployTestConfig({ migrations: true }));

    expect(
      await deploy(['docker', '--dry-run'], {
        config: await deployTestConfig({ migrations: true }),
        io: wired.io,
      }),
    ).toBe(0);
    expect(wired.stdout()).toContain('[dry-run] $ docker build -t deals:');
  });
});
