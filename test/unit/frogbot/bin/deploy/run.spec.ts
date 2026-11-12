import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { dockerfile } from '../../../../../packages/frogbot/src/bin/deploy/dockerfile.js';
import { DeployError } from '../../../../../packages/frogbot/src/bin/deploy/error.js';
import { runDeploy, splitDeployArgs } from '../../../../../packages/frogbot/src/bin/deploy/run.js';
import type { DeployTarget } from '../../../../../packages/frogbot/src/bin/deploy/types.js';
import { deployConfig, recordingTarget, tempDir, testIO, writeApp } from './helpers.js';

describe('splitDeployArgs', () => {
  it('takes the shared flags and leaves the rest for the target', () => {
    expect(
      splitDeployArgs([
        '--dry-run',
        '--tag',
        'v1',
        '--json',
        '--env-file',
        '.env.prod',
        '--no-interactive',
      ]),
    ).toEqual({
      flags: { dryRun: true, json: true, noInteractive: true, envFile: '.env.prod' },
      args: ['--tag', 'v1'],
    });

    expect(splitDeployArgs(['--env-file=.env.prod']).flags.envFile).toBe('.env.prod');
  });

  it('exits 2 when --env-file has no path', () => {
    expect(() => splitDeployArgs(['--env-file'])).toThrow('--env-file needs a path');
  });
});

describe('runDeploy', () => {
  it('runs the target with the args left after the shared flags', async () => {
    const root = await tempDir();
    const { target, seen } = recordingTarget();
    const io = testIO({ cwd: root, programs: { tool: () => undefined } });

    await writeApp(root);

    expect(await runDeploy(target, ['--flag', 'x'], io.io, { name: 'test', image: true })).toBe(0);
    expect(seen).toEqual({ args: ['--flag', 'x'], ran: true });
    expect(io.calls).toEqual([{ command: 'tool', args: ['ship', '--token', 'hunter2'] }]);
    expect(io.stdout()).toContain('$ tool ship --token ••••');
    expect(await readFile(join(root, 'out.txt'), 'utf8')).toBe('done');
  });

  it('prints every failed check together, exits 1, and runs and writes nothing', async () => {
    const root = await tempDir();
    const { target, seen } = recordingTarget([
      { code: 'NOT_LOGGED_IN', message: '`tool` is not logged in.', fix: 'Run `tool login`.' },
    ]);

    const io = testIO({ cwd: root, config: deployConfig({ prodMigrations: undefined }) });

    await writeApp(root, { '.env': '', Dockerfile: '' });
    await rm(join(root, 'Dockerfile'));
    await rm(join(root, 'pnpm-lock.yaml'));

    expect(await runDeploy(target, [], io.io, { name: 'test', image: true })).toBe(1);

    const codes = io.stderr().flatMap((line) => /^\[frogbot\] ([A-Z_]+) /.exec(line)?.[1] ?? []);

    expect(codes.sort()).toEqual(
      [
        'DOCKERFILE_MISSING',
        'MIGRATIONS_NOT_WIRED',
        'NOT_LOGGED_IN',
        'NO_LOCKFILE',
        'SECRET_MISSING',
      ].sort(),
    );
    expect(io.stderr().at(-1)).toBe(
      '[frogbot] deploy test stopped before changing anything: 5 problems.',
    );
    expect(seen.ran).toBe(false);
    expect(io.calls).toEqual([]);
    expect(existsSync(join(root, 'Dockerfile'))).toBe(false);
  });

  it.each([
    ['no prodMigrations', undefined, '`prodMigrations`'],
    ['an empty prodMigrations', [], '`prodMigrations` is empty'],
  ])('reports MIGRATIONS_NOT_WIRED for %s', async (_, prodMigrations, text) => {
    const root = await tempDir();
    const io = testIO({ cwd: root, config: deployConfig({ prodMigrations }) });

    await writeApp(root);

    expect(
      await runDeploy(recordingTarget().target, [], io.io, { name: 'test', image: true }),
    ).toBe(1);
    expect(io.stderr()[0]).toContain('[frogbot] MIGRATIONS_NOT_WIRED');
    expect(io.stderr()[0]).toContain(text);
  });

  it('checks only the lockfile and the target for a plugin target', async () => {
    const root = await tempDir();
    const io = testIO({ cwd: root, config: deployConfig({ prodMigrations: undefined }) });

    await writeApp(root, { '.env': '' });
    await rm(join(root, 'Dockerfile'));

    expect(await runDeploy(recordingTarget().target, ['--dry-run'], io.io, { name: 'dojo' })).toBe(
      0,
    );
  });

  it('reports a config that fails to load as CONFIG_INVALID', async () => {
    const root = await tempDir();
    const io = testIO({
      cwd: root,
      config: () => Promise.reject(new Error('[frogbot] collections[0] has no slug')),
    });

    await writeApp(root);

    expect(
      await runDeploy(recordingTarget().target, [], io.io, { name: 'test', image: true }),
    ).toBe(1);
    expect(io.stderr()[0]).toBe('[frogbot] CONFIG_INVALID collections[0] has no slug');
  });

  it('dry-runs: prints files and commands in order, changes nothing, exits 0', async () => {
    const root = await tempDir();
    const io = testIO({ cwd: root });

    await writeApp(root);

    expect(
      await runDeploy(recordingTarget().target, ['--dry-run'], io.io, {
        name: 'test',
        image: true,
      }),
    ).toBe(0);
    expect(io.stdout()).toEqual([
      '[dry-run] $ tool ship --token ••••',
      '[dry-run] write out.txt',
      '[frogbot] Dry run of deploy test: nothing was changed.',
    ]);
    expect(io.calls).toEqual([]);
    expect(existsSync(join(root, 'out.txt'))).toBe(false);
  });

  it('prints one JSON result on stdout and everything else on stderr', async () => {
    const root = await tempDir();
    const io = testIO({ cwd: root });

    await writeApp(root);

    expect(
      await runDeploy(recordingTarget().target, ['--dry-run', '--json'], io.io, {
        name: 'test',
        image: true,
      }),
    ).toBe(0);
    expect(io.stdout()).toHaveLength(1);
    expect(JSON.parse(io.stdout()[0] ?? '')).toEqual({
      target: 'test',
      ok: true,
      dryRun: true,
      issues: [],
      result: { steps: ['$ tool ship --token ••••', 'write out.txt'], shipped: true },
    });
    expect(io.stderr()).toContain('[dry-run] write out.txt');
  });

  it('lists the issues in the JSON result when a check fails', async () => {
    const root = await tempDir();
    const io = testIO({ cwd: root, config: deployConfig({ prodMigrations: undefined }) });

    await writeApp(root);

    expect(
      await runDeploy(recordingTarget().target, ['--json'], io.io, { name: 'docker', image: true }),
    ).toBe(1);

    const result = JSON.parse(io.stdout()[0] ?? '') as { ok: boolean; issues: { code: string }[] };

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(['MIGRATIONS_NOT_WIRED']);
  });

  it('reads FROGBOT_SECRET from --env-file', async () => {
    const root = await tempDir();
    const io = testIO({ cwd: root, programs: { tool: () => undefined } });

    await writeApp(root, { '.env': '', 'deploy.env': 'FROGBOT_SECRET=from-file\n' });

    expect(
      await runDeploy(recordingTarget().target, ['--env-file', 'deploy.env'], io.io, {
        name: 'test',
        image: true,
      }),
    ).toBe(0);
  });

  it('reads --env-file alone, ignoring .env and the shell', async () => {
    const root = await tempDir();
    const io = testIO({ cwd: root, env: { FROGBOT_SECRET: 'from-shell' } });

    await writeApp(root, { 'prod.env': 'DATABASE_URL=postgres://db.example.com/app\n' });

    expect(
      await runDeploy(recordingTarget().target, ['--env-file', 'prod.env'], io.io, {
        name: 'test',
        image: true,
      }),
    ).toBe(1);
    expect(io.stderr()[0]).toBe('[frogbot] SECRET_MISSING FROGBOT_SECRET is empty.');
  });

  it('takes the production .env files and the shell, never .env.development', async () => {
    const root = await tempDir();
    const dev = testIO({ cwd: root });

    await writeApp(root, { '.env': '', '.env.development': 'FROGBOT_SECRET=dev-only\n' });

    expect(
      await runDeploy(recordingTarget().target, [], dev.io, { name: 'test', image: true }),
    ).toBe(1);
    expect(dev.stderr()[0]).toBe('[frogbot] SECRET_MISSING FROGBOT_SECRET is empty.');

    const shell = testIO({
      cwd: root,
      env: { FROGBOT_SECRET: 'from-shell' },
      programs: { tool: () => undefined },
    });

    expect(
      await runDeploy(recordingTarget().target, [], shell.io, { name: 'test', image: true }),
    ).toBe(0);
  });

  it('exits 2 when --env-file names a missing file', async () => {
    const root = await tempDir();
    const io = testIO({ cwd: root });

    await writeApp(root);

    expect(
      await runDeploy(recordingTarget().target, ['--env-file', 'nope.env'], io.io, {
        name: 'test',
        image: true,
      }),
    ).toBe(2);
  });

  describe('a missing Dockerfile', () => {
    it('is written from the template on an interactive yes, then the deploy goes on', async () => {
      const root = await tempDir();
      const io = testIO({
        cwd: root,
        isTTY: true,
        confirm: true,
        programs: { tool: () => undefined },
      });

      await writeApp(root);
      await rm(join(root, 'Dockerfile'));

      expect(
        await runDeploy(recordingTarget().target, [], io.io, { name: 'test', image: true }),
      ).toBe(0);
      expect(io.asked).toEqual(["No Dockerfile. Write FrogBot's template Dockerfile?"]);
      expect(await readFile(join(root, 'Dockerfile'), 'utf8')).toBe(dockerfile);
    });

    it('stops without asking under --no-interactive', async () => {
      const root = await tempDir();
      const io = testIO({ cwd: root, isTTY: true });

      await writeApp(root);
      await rm(join(root, 'Dockerfile'));

      expect(
        await runDeploy(recordingTarget().target, ['--no-interactive'], io.io, {
          name: 'test',
          image: true,
        }),
      ).toBe(1);
      expect(io.asked).toEqual([]);
      expect(io.stderr()[0]).toBe('[frogbot] DOCKERFILE_MISSING No Dockerfile in the app.');
      expect(existsSync(join(root, 'Dockerfile'))).toBe(false);
    });

    it('is not offered while another check fails', async () => {
      const root = await tempDir();
      const io = testIO({
        cwd: root,
        isTTY: true,
        config: deployConfig({ prodMigrations: undefined }),
      });

      await writeApp(root);
      await rm(join(root, 'Dockerfile'));

      expect(
        await runDeploy(recordingTarget().target, [], io.io, { name: 'test', image: true }),
      ).toBe(1);
      expect(io.asked).toEqual([]);
    });
  });

  it('stops with the failing command when a step exits non-zero', async () => {
    const root = await tempDir();
    const io = testIO({ cwd: root, programs: { tool: () => ({ code: 3 }) } });

    await writeApp(root);

    expect(
      await runDeploy(recordingTarget().target, [], io.io, { name: 'test', image: true }),
    ).toBe(1);
    expect(io.stderr()).toContain('[frogbot] `tool ship --token ••••` failed (exit 3).');
  });

  it('names the failed step, its stderr and the steps already done under --json', async () => {
    const root = await tempDir();
    const io = testIO({
      cwd: root,
      programs: {
        fly: (args) =>
          args[0] === 'deploy' ? { code: 1, stderr: 'building\nError: insufficient memory\n' } : {},
      },
    });

    const target: DeployTarget = {
      describe: 'Fly',
      preflight: () => [],
      run: async (context) => {
        await context.run('fly', ['apps', 'create', 'deals']);
        await context.writeFile('fly.toml', 'app = "deals"');
        await context.run('fly', ['deploy', '--app', 'deals']);
      },
    };

    await writeApp(root);

    expect(await runDeploy(target, ['--json'], io.io, { name: 'fly', image: true })).toBe(1);
    expect(io.stdout()).toHaveLength(1);
    expect(JSON.parse(io.stdout()[0] ?? '')).toEqual({
      target: 'fly',
      ok: false,
      dryRun: false,
      issues: [],
      result: null,
      code: 'COMMAND_FAILED',
      error: '`fly deploy --app deals` failed (exit 1).',
      command: 'fly deploy --app deals',
      stderr: 'building\nError: insufficient memory',
      steps: ['$ fly apps create deals', 'write fly.toml'],
    });
  });

  it('keeps an unexpected error to one JSON result under --json', async () => {
    const root = await tempDir();
    const io = testIO({ cwd: root });

    const target: DeployTarget = {
      describe: 'Broken',
      preflight: () => [],
      run: () => {
        throw new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED') });
      },
    };

    await writeApp(root);

    expect(await runDeploy(target, ['--json'], io.io, { name: 'test' })).toBe(1);
    expect(io.stderr()).toContain('[frogbot] fetch failed');
    expect(JSON.parse(io.stdout()[0] ?? '')).toMatchObject({
      target: 'test',
      ok: false,
      code: 'UNEXPECTED_ERROR',
      error: expect.stringContaining('Caused by: Error: connect ECONNREFUSED'),
    });
  });

  it('still throws an unexpected error without --json', async () => {
    const root = await tempDir();
    const io = testIO({ cwd: root });

    const target: DeployTarget = {
      describe: 'Broken',
      preflight: () => [],
      run: () => {
        throw new TypeError('fetch failed');
      },
    };

    await writeApp(root);

    await expect(runDeploy(target, [], io.io, { name: 'test' })).rejects.toThrow('fetch failed');
  });

  it('masks every secret whole, even when one contains another', async () => {
    const root = await tempDir();
    const io = testIO({
      cwd: root,
      programs: { tool: () => ({ code: 1, stderr: 'bad token hunter2-admin\n' }) },
    });

    const target: DeployTarget = {
      describe: 'Tool',
      preflight: () => [],
      run: async (context) => {
        await context.run('tool', ['ship', '--token', 'hunter2-admin'], {
          mask: ['hunter2', 'hunter2-admin'],
        });
      },
    };

    await writeApp(root);

    expect(await runDeploy(target, ['--json'], io.io, { name: 'test', image: true })).toBe(1);

    const stdout = io.stdout().join('\n');

    expect(stdout).not.toContain('admin');
    expect(JSON.parse(stdout)).toMatchObject({
      code: 'COMMAND_FAILED',
      command: 'tool ship --token ••••',
      stderr: 'bad token ••••',
      error: '`tool ship --token ••••` failed (exit 1).',
    });
  });

  it("keeps the result's own fields when a stop's fields name them too", async () => {
    const root = await tempDir();
    const io = testIO({ cwd: root });

    const target: DeployTarget = {
      describe: 'Broken',
      preflight: () => [],
      run: () => {
        throw new DeployError('Stopped.', 1, {
          code: 'STOPPED',
          fields: { ok: true, target: 'other', code: 'OVERRIDE', error: 'other' },
        });
      },
    };

    await writeApp(root);

    expect(await runDeploy(target, ['--json'], io.io, { name: 'test' })).toBe(1);
    expect(JSON.parse(io.stdout()[0] ?? '')).toMatchObject({
      target: 'test',
      ok: false,
      code: 'STOPPED',
      error: 'Stopped.',
    });
  });
});
