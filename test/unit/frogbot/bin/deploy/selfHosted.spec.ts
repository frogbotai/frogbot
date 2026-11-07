import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runDeploy } from '../../../../../packages/frogbot/src/bin/deploy/run.js';
import { dockerTarget } from '../../../../../packages/frogbot/src/bin/deploy/targets/docker.js';
import { flyTarget } from '../../../../../packages/frogbot/src/bin/deploy/targets/fly.js';
import type { DeployTarget } from '../../../../../packages/frogbot/src/bin/deploy/types.js';
import { type FakeProgram, tempDir, testIO, writeApp } from './helpers.js';

async function deployWith(
  target: DeployTarget,
  name: string,
  args: string[],
  { programs, files }: { programs: Record<string, FakeProgram>; files?: Record<string, string> },
) {
  const root = await tempDir();
  const io = testIO({ cwd: root, programs });

  await writeApp(root, files);

  const code = await runDeploy(target, args, io.io, { name, image: true });

  return { root, code, ...io };
}

describe('deploy docker', () => {
  it('builds <app>:<hash> and prints the docker run line', async () => {
    const { code, commands, stdout } = await deployWith(dockerTarget, 'docker', [], {
      programs: { docker: () => undefined },
    });

    expect(code).toBe(0);
    expect(commands()).toEqual([
      'docker info',
      expect.stringMatching(/^docker build -t deals-app:[0-9a-f]{12} \.$/),
    ]);
    expect(stdout().at(-1)).toMatch(
      /^docker run -p 3000:3000 --env-file \.env deals-app:[0-9a-f]{12}$/,
    );
  });

  it('uses --tag, and a volume for a SQLite file database', async () => {
    const { commands, stdout } = await deployWith(dockerTarget, 'docker', ['--tag', 'v1'], {
      programs: { docker: () => undefined },
      files: { '.env': 'FROGBOT_SECRET=x\nDATABASE_URL=file:./frogbot.db\n' },
    });

    expect(commands()).toContain('docker build -t deals-app:v1 .');
    expect(stdout().at(-1)).toBe(
      'docker run -p 3000:3000 --env-file .env -v frogbot-data:/data -e DATABASE_URL=file:/data/frogbot.db deals-app:v1',
    );
  });

  it('never pushes', async () => {
    const { commands } = await deployWith(dockerTarget, 'docker', [], {
      programs: { docker: () => undefined },
    });

    expect(commands().some((command) => command.startsWith('docker push'))).toBe(false);
  });

  it('reports TOOL_MISSING and a stopped daemon', async () => {
    const missing = await deployWith(dockerTarget, 'docker', [], { programs: {} });

    expect(missing.code).toBe(1);
    expect(missing.stderr()[0]).toBe("[frogbot] TOOL_MISSING `docker` isn't installed.");

    const stopped = await deployWith(dockerTarget, 'docker', [], {
      programs: { docker: (args) => (args[0] === 'info' ? { code: 1 } : undefined) },
    });

    expect(stopped.code).toBe(1);
    expect(stopped.stderr()[0]).toBe("[frogbot] NOT_LOGGED_IN Docker isn't running.");
  });

  it('exits 2 on an unknown flag', async () => {
    const { code, stderr } = await deployWith(dockerTarget, 'docker', ['--push'], {
      programs: { docker: () => undefined },
    });

    expect(code).toBe(2);
    expect(stderr().join('\n')).toContain('Usage: frogbot deploy docker [--tag <tag>]');
  });
});

describe('deploy fly', () => {
  const fly: FakeProgram = (args) => {
    if (args[0] === 'volumes' && args[1] === 'list') return { stdout: '[]' };

    return undefined;
  };

  it('writes fly.toml, creates the app and a volume for SQLite, stages secrets and deploys one machine', async () => {
    const { root, code, calls, commands } = await deployWith(
      flyTarget,
      'fly',
      ['--region', 'sjc'],
      {
        programs: { fly },
        files: {
          '.env':
            'FROGBOT_SECRET=s3cret\nDATABASE_URL=file:./frogbot.db\nNEXT_PUBLIC_SITE=https://x.dev\n',
        },
      },
    );

    expect(code).toBe(0);
    expect(commands()).toEqual([
      'fly auth whoami',
      'fly apps create deals-app',
      'fly volumes create frogbot_data --size 1 --region sjc --app deals-app --yes',
      'fly secrets import --app deals-app --stage',
      'fly deploy --app deals-app --ha=false --build-arg NEXT_PUBLIC_SITE=https://x.dev',
    ]);
    expect(calls.find((call) => call.args[0] === 'secrets')?.input).toBe(
      'FROGBOT_SECRET="s3cret"\nDATABASE_URL="file:/data/frogbot.db"',
    );

    const toml = await readFile(join(root, 'fly.toml'), 'utf8');

    expect(toml).toContain("app = 'deals-app'");
    expect(toml).toContain("primary_region = 'sjc'");
    expect(toml).toContain("destination = '/data'");
    expect(toml).toContain("path = '/api/health'");
  });

  it('re-runs against the existing fly.toml and volume, and adds no volume for a hosted database', async () => {
    const existing =
      "app = 'deals-prod'\nprimary_region = 'ams'\n\n[mounts]\n  source = 'frogbot_data'\n  destination = '/data'\n";

    const sqlite = await deployWith(flyTarget, 'fly', [], {
      programs: {
        fly: (args) => (args[1] === 'list' ? { stdout: '[{"name":"frogbot_data"}]' } : undefined),
      },
      files: { 'fly.toml': existing, '.env': 'FROGBOT_SECRET=s\nDATABASE_URL=file:./x.db\n' },
    });

    expect(sqlite.commands()).toEqual([
      'fly auth whoami',
      'fly volumes list --app deals-prod --json',
      'fly secrets import --app deals-prod --stage',
      'fly deploy --app deals-prod --ha=false',
    ]);

    const hosted = await deployWith(flyTarget, 'fly', [], { programs: { fly } });

    expect(hosted.commands().some((command) => command.includes('volumes'))).toBe(false);
    expect(await readFile(join(hosted.root, 'fly.toml'), 'utf8')).not.toContain('[mounts]');
  });

  it('dry-runs without writing fly.toml or calling fly beyond the login check', async () => {
    const { root, code, commands, stdout } = await deployWith(flyTarget, 'fly', ['--dry-run'], {
      programs: { fly },
    });

    expect(code).toBe(0);
    expect(commands()).toEqual(['fly auth whoami']);
    expect(existsSync(join(root, 'fly.toml'))).toBe(false);
    expect(stdout()).toContain('[dry-run] write fly.toml');
    expect(stdout()).toContain(
      '[dry-run] $ fly deploy --app deals-app --ha=false --build-arg NEXT_PUBLIC_SITE=https://deals.example.com',
    );
  });

  it('stops when an existing fly.toml mounts no volume for a SQLite file', async () => {
    const { code, commands, stderr } = await deployWith(flyTarget, 'fly', [], {
      programs: { fly },
      files: {
        '.env': 'FROGBOT_SECRET=x\nDATABASE_URL=file:./frogbot.db\n',
        'fly.toml': "app = 'deals'\nprimary_region = 'iad'\n",
      },
    });

    expect(code).toBe(1);
    expect(stderr()[0]).toMatch(/^\[frogbot\] FLY_NO_MOUNT /);
    expect(commands()).toEqual(['fly auth whoami']);
  });

  it('creates the app again after a failed first run, and refuses an --app fly.toml disagrees with', async () => {
    const root = await tempDir();

    await writeApp(root);

    const taken = testIO({
      cwd: root,
      programs: { fly: (args) => (args[0] === 'apps' ? { code: 1 } : undefined) },
    });

    expect(await runDeploy(flyTarget, [], taken.io, { name: 'fly', image: true })).toBe(1);
    expect(existsSync(join(root, 'fly.toml'))).toBe(false);

    const renamed = testIO({ cwd: root, programs: { fly } });

    expect(
      await runDeploy(flyTarget, ['--app', 'deals-2'], renamed.io, { name: 'fly', image: true }),
    ).toBe(0);
    expect(renamed.commands()).toContain('fly apps create deals-2');

    const mismatch = testIO({ cwd: root, programs: { fly } });

    expect(
      await runDeploy(flyTarget, ['--app', 'other'], mismatch.io, { name: 'fly', image: true }),
    ).toBe(1);
    expect(mismatch.stderr()[0]).toMatch(/^\[frogbot\] FLY_APP_MISMATCH /);
  });

  it('reports NOT_LOGGED_IN with the login command', async () => {
    const { code, stderr } = await deployWith(flyTarget, 'fly', [], {
      programs: { flyctl: () => ({ code: 1 }) },
    });

    expect(code).toBe(1);
    expect(stderr().slice(0, 2)).toEqual([
      "[frogbot] NOT_LOGGED_IN `flyctl` isn't logged in.",
      '  fix: Run `fly auth login`.',
    ]);
  });
});
