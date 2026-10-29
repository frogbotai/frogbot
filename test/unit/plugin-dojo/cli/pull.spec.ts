import { execFile } from 'node:child_process';
import { lstat, readdir, readFile, rm, stat, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { writeToken } from '../../../../packages/plugins/plugin-dojo/src/cli/auth.js';
import { runPull } from '../../../../packages/plugins/plugin-dojo/src/cli/pull.js';
import { startFakeDojo } from './fakeDojo.js';
import { tempDir, testIO, writeFiles } from './helpers.js';

const appFiles = {
  'package.json': '{"name":"deals"}',
  'pnpm-lock.yaml': '',
  'src/frogbot.config.ts': 'export default {};',
  'src/page.tsx': 'export default 1;',
  '.gitignore': 'node_modules\n',
};

const execFileAsync = promisify(execFile);

async function tarball(cwd: string, paths: string[]): Promise<Buffer> {
  const file = join(await tempDir(), 'source.tar.gz');

  await execFileAsync('tar', ['-czPf', file, '-C', cwd, ...paths], {
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  });

  return readFile(file);
}

function prefixed(prefix: string, files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(files).map(([path, text]) => [`${prefix}${path}`, text]),
  );
}

async function appTarball(extra: Record<string, string> = {}): Promise<Buffer> {
  const dir = await tempDir();

  await writeFiles(dir, { ...appFiles, ...extra });

  return tarball(dir, Object.keys({ ...appFiles, ...extra }));
}

async function setup() {
  const cwd = await tempDir();
  const dojo = await startFakeDojo();
  const env = { XDG_CONFIG_HOME: await tempDir(), FROGBOT_DOJO_URL: dojo.url };

  dojo.projects.push({ id: 7, name: 'deals', slug: 'deals', workspace: 1 });
  dojo.level = 'editor';
  dojo.tokens.set('fb_stored', 100);
  await writeToken(env, dojo.url, 'fb_stored');

  const run = async (args: string[]) => {
    const io = testIO({ cwd, env });

    return { code: await runPull(args, io.io), ...io };
  };

  return { cwd, dojo, run };
}

describe('frogbot pull', () => {
  it("writes the archive's files, the link and a fresh .env into ./<slug>", async () => {
    const { cwd, dojo, run } = await setup();

    dojo.source = await appTarball();

    const result = await run(['deals']);
    const dest = join(cwd, 'deals');

    expect(result.code).toBe(0);
    expect(dojo.paths()).toEqual([
      'GET /api/users/me',
      'GET /api/apps/deals',
      'GET /api/apps/7/source',
    ]);
    expect(await readdir(cwd)).toEqual(['deals']);
    expect((await readdir(dest, { recursive: true })).sort()).toEqual([
      '.env',
      '.frogbot',
      '.frogbot/app.json',
      '.gitignore',
      'package.json',
      'pnpm-lock.yaml',
      'src',
      'src/frogbot.config.ts',
      'src/page.tsx',
    ]);
    expect(await readFile(join(dest, 'src/page.tsx'), 'utf8')).toBe('export default 1;');
    expect(JSON.parse(await readFile(join(dest, '.frogbot/app.json'), 'utf8'))).toEqual({
      appId: 7,
    });
    expect(await readFile(join(dest, '.gitignore'), 'utf8')).toBe('node_modules\n/.frogbot\n');
    expect(await readFile(join(dest, '.env'), 'utf8')).toMatch(
      /^DATABASE_URL=file:\.\/frogbot\.db\nFROGBOT_SECRET=[0-9a-f]{48}\n$/,
    );
    expect(result.stdout()).toEqual([
      '[frogbot] Pulled deals into ./deals. It starts with an empty database; production keys stay on Dojo.',
      'cd deals',
      'pnpm install',
      'pnpm dev',
    ]);
    expect(result.stderr()).toEqual([]);
  });

  it('makes a new FROGBOT_SECRET each time', async () => {
    const first = await setup();
    const second = await setup();
    const source = await appTarball();

    first.dojo.source = source;
    second.dojo.source = source;

    expect((await first.run(['deals'])).code).toBe(0);
    expect((await second.run(['deals'])).code).toBe(0);

    const secret = async (cwd: string) =>
      (await readFile(join(cwd, 'deals/.env'), 'utf8')).match(/FROGBOT_SECRET=(\w+)/)?.[1];

    expect(await secret(first.cwd)).not.toBe(await secret(second.cwd));
  });

  it('takes the app id too', async () => {
    const { cwd, dojo, run } = await setup();

    dojo.source = await appTarball();

    expect((await run(['7'])).code).toBe(0);
    expect(dojo.paths()).toContain('GET /api/apps/7');
    expect(await readdir(cwd)).toEqual(['deals']);
  });

  it.each([[[]], [['deals', 'more']], [['--yes']]])(
    'prints usage and exits 2 for %j',
    async (args) => {
      const { dojo, run } = await setup();
      const result = await run(args);

      expect(result.code).toBe(2);
      expect(result.stderr()).toEqual(['[frogbot] Usage: frogbot pull <app>']);
      expect(dojo.requests).toEqual([]);
    },
  );

  it('refuses an existing ./<slug> and leaves it untouched', async () => {
    const { cwd, dojo, run } = await setup();

    dojo.source = await appTarball();
    await writeFiles(cwd, { 'deals/notes.md': 'mine' });

    const before = await stat(join(cwd, 'deals'));
    const result = await run(['deals']);

    expect(result.code).toBe(1);
    expect(result.stderr()).toEqual([
      '[frogbot] ./deals already exists; pull somewhere else or remove it.',
    ]);
    expect(dojo.paths()).not.toContain('GET /api/apps/7/source');
    expect(await readdir(join(cwd, 'deals'))).toEqual(['notes.md']);
    expect(await readFile(join(cwd, 'deals/notes.md'), 'utf8')).toBe('mine');
    expect((await stat(join(cwd, 'deals'))).mtimeMs).toBe(before.mtimeMs);
    expect(await readdir(cwd)).toEqual(['deals']);
  });

  it('writes no symlink from the archive', async () => {
    const { cwd, dojo, run } = await setup();
    const dir = await tempDir();

    await writeFiles(dir, appFiles);
    await symlink('/etc/hosts', join(dir, 'hosts'));
    await symlink('src', join(dir, 'code'));
    dojo.source = await tarball(dir, [...Object.keys(appFiles), 'hosts', 'code']);

    const result = await run(['deals']);

    expect(result.code).toBe(0);
    await expect(lstat(join(cwd, 'deals/hosts'))).rejects.toThrow();
    await expect(lstat(join(cwd, 'deals/code'))).rejects.toThrow();
  });

  it.each(['a `..` entry', 'an absolute entry'])(
    'refuses %s and writes nothing outside ./<slug>',
    async (kind) => {
      const { cwd, dojo, run } = await setup();
      const dir = await tempDir();
      const outside = join(dir, 'outside.txt');

      await writeFiles(dir, { ...prefixed('app/', appFiles), 'outside.txt': 'packed' });

      const entry = kind === 'a `..` entry' ? '../outside.txt' : outside;

      dojo.source = await tarball(join(dir, 'app'), [...Object.keys(appFiles), entry]);
      await rm(outside);

      const result = await run(['deals']);

      expect(result.code).toBe(1);
      expect(result.stderr()).toEqual([
        expect.stringMatching(/^\[frogbot\] Couldn't unpack the app's source: TAR_ENTRY_/),
      ]);
      expect(await readdir(cwd)).toEqual([]);
      await expect(lstat(outside)).rejects.toThrow();
    },
  );

  it.each([
    [
      '403 on the lookup',
      'deals',
      {
        appReply: {
          status: 403,
          message: "You can't share to this app. Only its editors and owners can.",
        },
      },
      "You can't share to this app. Only its editors and owners can.",
    ],
    ['404 on the lookup', 'nope', {}, 'No such app.'],
    ['404 on the source', 'deals', {}, 'This app has nothing live to pull yet.'],
    [
      '403 on the source',
      'deals',
      {
        sourceReply: {
          status: 403,
          message: "You can't share to this app. Only its editors and owners can.",
        },
      },
      "You can't share to this app. Only its editors and owners can.",
    ],
  ])("prints Dojo's line on %s and leaves no folder", async (_, app, change, line) => {
    const { cwd, dojo, run } = await setup();

    Object.assign(dojo, change);

    const result = await run([app]);

    expect(result.code).toBe(1);
    expect(result.stderr()).toEqual([`[frogbot] ${line}`]);
    expect(result.stdout()).toEqual([]);
    expect(await readdir(cwd)).toEqual([]);
  });

  it('leaves no staging folder when writing fails partway', async () => {
    const { cwd, dojo, run } = await setup();

    dojo.source = Buffer.from('not a tarball');

    const result = await run(['deals']);

    expect(result.code).toBe(1);
    expect(result.stderr()).toHaveLength(1);
    expect(await readdir(cwd)).toEqual([]);
  });
});
