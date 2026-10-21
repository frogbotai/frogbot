import { readFile, rm, stat, symlink } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { authPath, writeToken } from '../../../../../packages/frogbot/src/bin/share/auth.js';
import { runShare } from '../../../../../packages/frogbot/src/bin/share/run.js';
import { startFakeDojo } from './fakeDojo.js';
import { tempDir, testIO, writeApp, writeFiles } from './helpers.js';

async function setup(files?: Record<string, string>) {
  const root = await tempDir();
  const dojo = await startFakeDojo();
  const env = { XDG_CONFIG_HOME: await tempDir(), FROGBOT_DOJO_URL: dojo.url };

  await writeApp(root, files);

  const run = async (
    args: string[],
    options: Omit<Parameters<typeof testIO>[0], 'cwd' | 'env'> = {},
  ) => {
    const io = testIO({ cwd: root, env, ...options });

    return { code: await runShare(args, io.io), ...io };
  };

  const signIn = async () => {
    dojo.tokens.set('fb_stored', 100);
    await writeToken(env, dojo.url, 'fb_stored');
  };

  return { root, dojo, env, run, signIn };
}

const shareLink = (url: string, id: number) =>
  `[frogbot] Share it: ${url}/admin/collections/projects/${id}?share=1`;

describe('frogbot share: pre-checks', () => {
  it.each([
    ['no lockfile', { 'pnpm-lock.yaml': undefined }, 'No lockfile: run `pnpm install` first.'],
    [
      'a Bun lockfile',
      { 'pnpm-lock.yaml': undefined, 'bun.lock': '' },
      "Bun isn't supported yet; run `pnpm install` to make a lockfile.",
    ],
  ])('stops on %s before any request', async (_, change, line) => {
    const { root, dojo, run } = await setup();

    for (const [path, contents] of Object.entries(change)) {
      if (contents === undefined) await rm(join(root, path));
      else await writeFiles(root, { [path]: contents });
    }

    const result = await run(['--no-data']);

    expect(result.code).toBe(1);
    expect(result.stderr()).toEqual([`[frogbot] ${line}`]);
    expect(dojo.requests).toEqual([]);
  });

  it('stops with no config before any request', async () => {
    const dojo = await startFakeDojo();
    const cwd = await tempDir();
    const io = testIO({ cwd, env: { FROGBOT_DOJO_URL: dojo.url, XDG_CONFIG_HOME: cwd } });

    expect(await runShare(['--no-data'], io.io)).toBe(1);
    expect(io.stderr()).toEqual([
      '[frogbot] No frogbot.config.ts here or in any parent folder. Run share from inside the app.',
    ]);
    expect(dojo.requests).toEqual([]);
  });

  it('exits 2 on an unknown flag', async () => {
    const { dojo, run } = await setup();
    const result = await run(['--nope']);

    expect(result.code).toBe(2);
    expect(result.stderr()[0]).toContain('Usage: frogbot share');
    expect(dojo.requests).toEqual([]);
  });
});

describe('frogbot share: sign-in', () => {
  it('prints the link and code on their own lines, opens no browser without a TTY, and stores the token 0600', async () => {
    const { dojo, env, run } = await setup();
    const result = await run(['--no-data']);

    expect(result.code).toBe(0);
    expect(result.stdout()).toEqual(
      expect.arrayContaining([`${dojo.url}/device?user_code=BCDF-GHJK`, 'BCDF-GHJK']),
    );
    expect(result.opened).toEqual([]);
    expect((await stat(authPath(env))).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(authPath(env), 'utf8'))).toEqual({
      tokens: { [dojo.url]: 'fb_test_1' },
    });
  });

  it('opens the browser with a TTY', async () => {
    const { dojo, run } = await setup();
    const result = await run(['--no-data'], { isTTY: true });

    expect(result.code).toBe(0);
    expect(result.opened).toEqual([`${dojo.url}/device?user_code=BCDF-GHJK`]);
  });

  it('signs in again when the stored token was revoked, and the share completes', async () => {
    const { dojo, env, run } = await setup();

    await writeToken(env, dojo.url, 'fb_revoked');

    const result = await run(['--no-data']);

    expect(result.code).toBe(0);
    expect(dojo.paths()).toContain('POST /api/cli/device/token');
    expect(result.stdout().at(-1)).toBe('https://deals.frogbot.app');
    expect(JSON.parse(await readFile(authPath(env), 'utf8'))).toEqual({
      tokens: { [dojo.url]: 'fb_test_1' },
    });
  });

  it('signs in again when Dojo answers 401 midway, and repeats the call', async () => {
    const { dojo, run, signIn } = await setup({ '.frogbot/app.json': '{"appId":1}' });

    await signIn();
    dojo.projects.push({ id: 1, name: 'deals', slug: 'deals', workspace: 1 });
    dojo.data.started = true;

    dojo.afterRequest = (route) => {
      if (route === 'GET /api/users/me') dojo.tokens.delete('fb_stored');
    };

    const result = await run([]);

    expect(result.code).toBe(0);
    expect(dojo.paths()).toEqual([
      'GET /api/apps/1',
      'GET /api/users/me',
      'POST /api/apps/1/deployments',
      'POST /api/cli/device/code',
      'POST /api/cli/device/token',
      'POST /api/cli/device/token',
      'POST /api/apps/1/deployments',
      'GET /api/deployments/7/logs',
    ]);
  });
});

describe('frogbot share: the link', () => {
  it('writes .frogbot/app.json and one /.frogbot line, then ships new versions to the same app', async () => {
    const { root, dojo, run, signIn } = await setup({ '.gitignore': 'node_modules' });

    await signIn();

    const first = await run(['--no-data']);

    expect(first.code).toBe(0);
    expect(JSON.parse(await readFile(join(root, '.frogbot/app.json'), 'utf8'))).toEqual({
      appId: 1,
    });
    expect(await readFile(join(root, '.gitignore'), 'utf8')).toBe('node_modules\n/.frogbot\n');
    expect(dojo.projects).toEqual([{ id: 1, name: 'Deals App', slug: 'deals-app', workspace: 1 }]);

    const second = await run([]);

    expect(second.code).toBe(0);
    expect(await readFile(join(root, '.gitignore'), 'utf8')).toBe('node_modules\n/.frogbot\n');
    expect(dojo.projects).toHaveLength(1);
    expect(dojo.paths().filter((path) => path === 'POST /api/apps/1/deployments')).toHaveLength(2);
    expect(second.stdout().slice(-2)).toEqual([
      shareLink(dojo.url, 1),
      'https://deals.frogbot.app',
    ]);
  });

  it('sends the archive as the source part', async () => {
    const { dojo, run, signIn } = await setup();

    await signIn();
    await run(['--no-data']);

    const upload = dojo.requests.find((request) => request.path === '/api/apps/1/deployments');
    const source = upload?.form?.get('source');

    expect(source).toBeInstanceOf(File);
    expect((source as File).size).toBeGreaterThan(0);
  });

  it('names .frogbot/app.json on a 403', async () => {
    const { dojo, run, signIn } = await setup({ '.frogbot/app.json': '{"appId":42}' });

    await signIn();

    const result = await run([]);

    expect(result.code).toBe(1);
    expect(result.stderr()).toEqual([
      "[frogbot] You can't share to the app in .frogbot/app.json (42): Only the app’s owners can publish it. Delete .frogbot/app.json to share as a new app.",
    ]);
    expect(dojo.paths()).not.toContain('GET /api/workspaces');
  });

  it('never uploads the login file, even when XDG_CONFIG_HOME is inside the app', async () => {
    const { root, env, run, signIn } = await setup();

    env.XDG_CONFIG_HOME = join(root, 'config');
    await signIn();

    const result = await run(['--no-data']);

    expect(result.code).toBe(0);
    expect(result.stdout()).toContainEqual(
      expect.stringMatching(/^\[frogbot\] Uploading 4 files \(/),
    );
  });

  it('names the symlinks it leaves out', async () => {
    const { root, run, signIn } = await setup();

    await signIn();
    await symlink(join(root, 'package.json'), join(root, 'a.json'));
    await symlink(join(root, 'src'), join(root, 'b'));

    const result = await run(['--no-data']);

    expect(result.code).toBe(0);
    expect(result.stdout()).toContain('[frogbot] Skipped 2 symlinks: a.json, b');
    expect(result.stdout()).toContainEqual(
      expect.stringMatching(/^\[frogbot\] Uploading 4 files \(\d\.\d KB\)$/),
    );
  });
});

describe('frogbot share: the build', () => {
  it('streams the log and ends with the live URL', async () => {
    const { dojo, run, signIn } = await setup();

    await signIn();

    const result = await run(['--no-data']);

    expect(result.code).toBe(0);
    expect(result.stdout()).toEqual([
      '[frogbot] Created deals-app in Trend Capital, linked in .frogbot/app.json.',
      expect.stringMatching(/^\[frogbot\] Uploading 4 files \(\d\.\d KB\)$/),
      '[build] step 1',
      '[build] step 2',
      shareLink(dojo.url, 1),
      'https://deals.frogbot.app',
    ]);
  });

  it('resumes a dropped log from the last line it has', async () => {
    const { dojo, run, signIn } = await setup();

    await signIn();
    dojo.build = { lines: ['one', 'two', 'three'], status: 'ready', dropAfter: 2 };

    const result = await run(['--no-data']);

    expect(result.code).toBe(0);
    expect(result.stdout().filter((line) => line.startsWith('[build]'))).toEqual([
      '[build] one',
      '[build] two',
      '[build] three',
    ]);
    expect(
      dojo.requests
        .filter((request) => request.path === '/api/deployments/7/logs')
        .map((request) => request.headers['last-event-id']),
    ).toEqual([undefined, '2']);
  });

  it('exits 1 with the error and the tail when the build fails', async () => {
    const { dojo, run, signIn } = await setup();

    await signIn();

    dojo.build = {
      lines: ['step 1', 'ERR_PNPM_OUTDATED_LOCKFILE'],
      status: 'failed',
      error: 'The build failed at `pnpm install`.',
      tail: ['step 1', 'ERR_PNPM_OUTDATED_LOCKFILE'],
    };

    const result = await run(['--no-data']);

    expect(result.code).toBe(1);
    expect(result.stdout()).toEqual(
      expect.arrayContaining(['[build] step 1', '[build] ERR_PNPM_OUTDATED_LOCKFILE']),
    );
    expect(result.stdout().join('\n')).not.toContain('Share it');
    expect(result.stderr()).toEqual([
      '[frogbot] Build failed: The build failed at `pnpm install`.',
      'step 1',
      'ERR_PNPM_OUTDATED_LOCKFILE',
    ]);
  });
});

describe('frogbot share: workspace', () => {
  const two = [
    { id: 1, name: 'Trend Capital', slug: 'trend-capital' },
    { id: 2, name: 'Colby', slug: 'colby' },
  ];

  it('uses the only workspace without asking', async () => {
    const { dojo, run, signIn } = await setup();

    await signIn();

    const result = await run(['--no-data'], { isTTY: true });

    expect(result.code).toBe(0);
    expect(result.asked).toEqual([]);
    expect(dojo.projects[0]?.workspace).toBe(1);
  });

  it('asks the person to choose when there are two and no TTY', async () => {
    const { root, dojo, run, signIn } = await setup();

    await signIn();
    dojo.workspaces = two;

    const result = await run(['--no-data']);

    expect(result.code).toBe(1);
    expect(result.stderr()).toEqual([
      '[frogbot] Ask the person which workspace to share in (trend-capital, colby), then rerun with --workspace <slug>.',
    ]);
    expect(dojo.paths()).not.toContain('POST /api/projects');
    await expect(stat(join(root, '.frogbot'))).rejects.toThrow();
  });

  it('takes --workspace, or the pick with a TTY', async () => {
    const flagged = await setup();

    await flagged.signIn();
    flagged.dojo.workspaces = two;

    expect((await flagged.run(['--no-data', '--workspace', 'colby'])).code).toBe(0);
    expect(flagged.dojo.projects[0]?.workspace).toBe(2);

    const picked = await setup();

    await picked.signIn();
    picked.dojo.workspaces = two;

    const result = await picked.run(['--no-data'], { isTTY: true, select: 'colby' });

    expect(result.code).toBe(0);
    expect(result.asked).toEqual(['Which workspace?']);
    expect(picked.dojo.projects[0]?.workspace).toBe(2);
  });

  it("prints Dojo's message and writes no link when the app can't be created", async () => {
    const { root, dojo, run, signIn } = await setup();

    await signIn();

    dojo.projectReply = {
      status: 403,
      body: { errors: [{ message: 'You are not allowed to perform this action.' }] },
    };

    const result = await run(['--no-data']);

    expect(result.code).toBe(1);
    expect(result.stderr()).toEqual([
      "[frogbot] Dojo couldn't create the app: You are not allowed to perform this action.",
    ]);
    await expect(stat(join(root, '.frogbot'))).rejects.toThrow();
    expect(dojo.paths()).not.toContain('POST /api/apps/1/deployments');
  });
});

describe('frogbot share: the name', () => {
  const taken = '[frogbot] The name "deals" is taken on Dojo. Rerun with --name <another name>.';

  it('sets the slug from --name on a first share', async () => {
    const { dojo, run, signIn } = await setup();

    await signIn();

    const result = await run(['--no-data', '--name', 'Deals']);

    expect(result.code).toBe(0);
    expect(dojo.projects).toEqual([{ id: 1, name: 'Deals App', slug: 'deals', workspace: 1 }]);
    expect(result.stdout()[0]).toBe(
      '[frogbot] Created deals in Trend Capital, linked in .frogbot/app.json.',
    );
  });

  it.each([
    ["Dojo's name_taken", 409, { error: 'name_taken' }],
    [
      "Payload's unique-field error on slug",
      400,
      {
        errors: [
          {
            name: 'ValidationError',
            message: 'The following field is invalid: slug',
            data: {
              collection: 'projects',
              errors: [{ message: 'Value must be unique', path: 'slug' }],
            },
          },
        ],
      },
    ],
  ])('asks for another name on %s, and writes no link', async (_, status, body) => {
    const { root, dojo, run, signIn } = await setup();

    await signIn();
    dojo.projectReply = { status, body };

    const result = await run(['--no-data', '--name', 'deals']);

    expect(result.code).toBe(1);
    expect(result.stderr()).toEqual([taken]);
    await expect(stat(join(root, '.frogbot'))).rejects.toThrow();
  });

  it("keeps Payload's message for another field error on slug", async () => {
    const { dojo, run, signIn } = await setup();

    await signIn();

    dojo.projectReply = {
      status: 400,
      body: {
        errors: [
          {
            name: 'ValidationError',
            message: 'The following field is invalid: slug',
            data: { errors: [{ message: 'Use 1–63 lowercase letters.', path: 'slug' }] },
          },
        ],
      },
    };

    const result = await run(['--no-data', '--name', 'deals']);

    expect(result.code).toBe(1);
    expect(result.stderr()).toEqual([
      "[frogbot] Dojo couldn't create the app: The following field is invalid: slug",
    ]);
  });
});

describe('frogbot share: as an editor', () => {
  const keysLeftOut = "[frogbot] Keys left out: only the app's owners manage its keys on Dojo.";

  async function linked(level?: 'editor' | 'owner') {
    const shared = await setup({
      '.frogbot/app.json': '{"appId":1}',
      '.env': 'STRIPE_KEY=sk_test_aaaa4242\n',
    });

    await shared.signIn();
    shared.dojo.projects.push({ id: 1, name: 'deals', slug: 'deals', workspace: 1 });
    shared.dojo.data.started = true;
    shared.dojo.keys.set(1, { STRIPE_KEY: 'sk_live_owner0001' });
    shared.dojo.level = level;

    return shared;
  }

  it('leaves keys out once, drops the Share it line and still prints the app URL', async () => {
    const { dojo, run } = await linked('editor');
    const result = await run(['--update-keys']);
    const upload = dojo.requests.find((request) => request.path === '/api/apps/1/deployments');

    expect(result.code).toBe(0);
    expect(dojo.paths().filter((path) => path.endsWith('/keys'))).toEqual([]);
    expect(dojo.paths()).not.toContain('GET /api/cli/sealing-key');
    expect(upload?.form?.has('keys')).toBe(false);
    expect(result.stdout().filter((line) => line === keysLeftOut)).toHaveLength(1);
    expect(result.stdout().join('\n')).not.toContain('Share it');
    expect(result.stdout().at(-1)).toBe('https://deals.frogbot.app');
    expect(dojo.keys.get(1)).toEqual({ STRIPE_KEY: 'sk_live_owner0001' });
  });

  it('says nothing about keys with --no-keys', async () => {
    const { run } = await linked('editor');
    const result = await run(['--no-keys']);

    expect(result.code).toBe(0);
    expect(result.stdout()).not.toContain(keysLeftOut);
    expect(result.stdout().at(-1)).toBe('https://deals.frogbot.app');
  });

  it.each([['owner' as const], [undefined]])(
    'compares keys and prints Share it as before when the level is %s',
    async (level) => {
      const { dojo, run } = await linked(level);
      const result = await run([]);

      expect(result.code).toBe(0);
      expect(dojo.paths()).toContain('GET /api/apps/1/keys');
      expect(result.stdout()).not.toContain(keysLeftOut);
      expect(result.stdout().slice(-2)).toEqual([
        shareLink(dojo.url, 1),
        'https://deals.frogbot.app',
      ]);
    },
  );
});
