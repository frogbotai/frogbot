import { execFile } from 'node:child_process';
import { lstat, readdir, readFile, rm, stat, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';

import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { writeToken } from '../../../../packages/plugins/plugin-dojo/src/cli/auth.js';
import { formatBytes } from '../../../../packages/plugins/plugin-dojo/src/cli/data/upload.js';
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

  dojo.apps.push({ id: 7, name: 'deals', slug: 'deals', workspace: 1 });
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
      'GET /api/apps/deals/cli',
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

  it('writes a local postgres:// DATABASE_URL for an app on a Postgres adapter', async () => {
    const { cwd, dojo, run } = await setup();

    dojo.source = await appTarball({
      'package.json': JSON.stringify({
        name: 'deals',
        dependencies: { '@frogbotai/db-postgres': '0.42.0', frogbot: '0.42.0' },
      }),
    });

    expect((await run(['deals'])).code).toBe(0);
    expect(await readFile(join(cwd, 'deals/.env'), 'utf8')).toMatch(
      /^DATABASE_URL=postgres:\/\/postgres:postgres@127\.0\.0\.1:5432\/deals\nFROGBOT_SECRET=[0-9a-f]{48}\n$/,
    );
  });

  it('keeps the file: line for an app on a SQLite adapter', async () => {
    const { cwd, dojo, run } = await setup();

    dojo.source = await appTarball({
      'package.json': JSON.stringify({
        name: 'deals',
        dependencies: { '@frogbotai/db-sqlite': '0.42.0' },
        devDependencies: { pg: '8.0.0' },
      }),
    });

    expect((await run(['deals'])).code).toBe(0);
    expect(await readFile(join(cwd, 'deals/.env'), 'utf8')).toMatch(
      /^DATABASE_URL=file:\.\/frogbot\.db\n/,
    );
  });

  it('takes the app id too', async () => {
    const { cwd, dojo, run } = await setup();

    dojo.source = await appTarball();

    expect((await run(['7'])).code).toBe(0);
    expect(dojo.paths()).toContain('GET /api/apps/7/cli');
    expect(await readdir(cwd)).toEqual(['deals']);
  });

  it.each([[[]], [['deals', 'more']], [['--yes']]])(
    'prints usage and exits 2 for %j',
    async (args) => {
      const { dojo, run } = await setup();
      const result = await run(args);

      expect(result.code).toBe(2);
      expect(result.stderr()).toEqual(['[frogbot] Usage: frogbot apps pull <app> [--data]']);
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

  describe('--data', () => {
    const zipOf = (files: Record<string, string | Uint8Array>) =>
      Buffer.from(
        zipSync(
          Object.fromEntries(
            Object.entries(files).map(([n, t]) => [n, typeof t === 'string' ? strToU8(t) : t]),
          ),
        ),
      );

    const exported = async (uploads: Record<string, string>) => {
      const path = join(await tempDir(), 'frogbot.db');
      const db = new DatabaseSync(path);

      db.exec('CREATE TABLE deals (id INTEGER PRIMARY KEY)');

      db.exec(
        'CREATE TABLE frogbot_dojo_uploads (slug TEXT PRIMARY KEY, static_dir TEXT NOT NULL)',
      );

      for (const [slug, dir] of Object.entries(uploads)) {
        db.prepare('INSERT INTO frogbot_dojo_uploads VALUES (?, ?)').run(slug, dir);
      }

      db.close();

      return readFile(path);
    };

    const owner = async () => {
      const context = await setup();

      context.dojo.level = 'owner';
      context.dojo.source = await appTarball();

      return context;
    };

    it("the data zip can't overwrite the pulled app's code", async () => {
      const upload = await owner();

      upload.dojo.dataZip = zipOf({
        'frogbot.db': await exported({ src: 'src' }),
        'src/page.tsx': 'process.exit(1);',
      });

      const collides = await upload.run(['deals', '--data']);

      expect(collides.code).toBe(1);
      expect(await readdir(upload.cwd)).toEqual([]);

      const other = await owner();

      other.dojo.dataZip = zipOf({
        'frogbot.db': await exported({}),
        'package.json': '{"name":"evil"}',
      });

      expect((await other.run(['deals', '--data'])).code).toBe(0);
      expect(await readFile(join(other.cwd, 'deals', 'package.json'), 'utf8')).toBe(
        '{"name":"deals"}',
      );
    });

    it("puts uploads in their collection's staticDir", async () => {
      const { cwd, dojo, run } = await owner();

      dojo.dataZip = zipOf({
        'frogbot.db': await exported({ media: 'public/media' }),
        'media/a.png': 'png',
      });

      const result = await run(['deals', '--data']);
      const dest = join(cwd, 'deals');
      const exists = (path: string) =>
        stat(join(dest, path)).then(
          () => true,
          () => false,
        );

      expect(result.code).toBe(0);
      expect({
        pub: await exists('public/media/a.png'),
        slug: await exists('media/a.png'),
      }).toEqual({ pub: true, slug: false });
    });

    it('an entry named like the download does not break the pull', async () => {
      const { dojo, run } = await owner();

      dojo.dataZip = zipOf({ '.frogbot-data.zip': 'x', 'frogbot.db': 'SQLite format 3\0' });

      await expect(run(['deals', '--data'])).resolves.toMatchObject({ code: 0 });
    });

    it('a damaged zip prints one [frogbot] line', async () => {
      const { dojo, run } = await owner();
      const zip = zipOf({ 'frogbot.db': 'SQLite format 3\0' });
      const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));

      zip.writeUInt16LE(5, end + 8);
      zip.writeUInt16LE(5, end + 10);
      dojo.dataZip = zip;

      const result = await run(['deals', '--data']);

      expect({ code: result.code, stderr: result.stderr() }).toEqual({
        code: 1,
        stderr: [expect.stringMatching(/^\[frogbot\] Couldn't unpack the app's data: /)],
      });
    });

    it('refuses a zip holding frogbot.db twice', async () => {
      const { cwd, dojo, run } = await owner();
      const zip = zipOf({ 'frogbot.db': 'SQLite format 3\0', 'frogbot.dX': 'second' });

      for (let at = zip.indexOf('frogbot.dX'); at >= 0; at = zip.indexOf('frogbot.dX', at)) {
        zip.write('frogbot.db', at);
      }

      dojo.dataZip = zip;

      const result = await run(['deals', '--data']);

      expect(result.code).toBe(1);
      expect(result.stderr()).toEqual([
        expect.stringMatching(/^\[frogbot\] Couldn't unpack the app's data: /),
      ]);
      expect(await readdir(cwd)).toEqual([]);
    });

    it('writes .env, which holds the live secret, readable by its owner only', async () => {
      const { cwd, dojo, run } = await owner();

      dojo.keys.set(7, { FROGBOT_SECRET: 'a'.repeat(48) });
      dojo.dataZip = zipOf({ 'frogbot.db': 'SQLite format 3\0' });

      expect((await run(['deals', '--data'])).code).toBe(0);
      expect((await stat(join(cwd, 'deals/.env'))).mode & 0o777).toBe(0o600);
    });

    it("AC 3: an owner's pull writes the database, the files and the app's secret", async () => {
      const { cwd, dojo, run } = await setup();

      dojo.level = 'owner';
      dojo.source = await appTarball();
      dojo.keys.set(7, { FROGBOT_SECRET: 'a'.repeat(48) });

      const database = await exported({ media: 'media' });

      dojo.dataZip = zipOf({
        'frogbot.db': database,
        'media/a.png': 'png',
        'media/sizes/a-200.webp': 'webp',
      });

      const result = await run(['deals', '--data']);
      const dest = join(cwd, 'deals');

      expect(result.code).toBe(0);
      expect(dojo.paths()).toEqual([
        'GET /api/users/me',
        'GET /api/apps/deals/cli',
        'GET /api/apps/7/source',
        'GET /api/apps/7/data',
      ]);
      expect(dojo.requests[1].search).toBe('?secret=1');

      const pulled = new DatabaseSync(join(dest, 'frogbot.db'));
      const tables = pulled.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();

      pulled.close();

      expect(tables.map(({ name }) => name)).toEqual(['deals']);
      expect(await readFile(join(dest, 'media/a.png'), 'utf8')).toBe('png');
      expect(await readFile(join(dest, 'media/sizes/a-200.webp'), 'utf8')).toBe('webp');
      expect(await readFile(join(dest, '.env'), 'utf8')).toBe(
        `DATABASE_URL=file:./frogbot.db\nFROGBOT_SECRET=${'a'.repeat(48)}\n`,
      );
      await expect(stat(join(dest, '.frogbot-data.zip'))).rejects.toThrow();
      expect(result.stdout()[0]).toBe(
        `[frogbot] Pulled deals into ./deals with its data: the database (${formatBytes(database.length)}) and 2 files.`,
      );
    });

    it("AC 3: an editor's pull prints the 403, writes no data and keeps the code", async () => {
      const { cwd, dojo, run } = await setup();

      dojo.source = await appTarball();
      dojo.keys.set(7, { FROGBOT_SECRET: 'a'.repeat(48) });
      dojo.dataZip = zipOf({ 'frogbot.db': 'SQLite format 3\0' });

      const result = await run(['deals', '--data']);
      const dest = join(cwd, 'deals');

      expect(result.code).toBe(0);
      await expect(stat(join(dest, 'frogbot.db'))).rejects.toThrow();
      expect(await readFile(join(dest, '.env'), 'utf8')).not.toContain('a'.repeat(48));
      expect(result.stdout().slice(0, 2)).toEqual([
        "[frogbot] Only this app's Admins can download its data. Pulling the code only.",
        '[frogbot] Pulled deals into ./deals. It starts with an empty database; production keys stay on Dojo.',
      ]);
    });

    it('refuses a zip naming a file outside the folder, leaving nothing', async () => {
      const { cwd, dojo, run } = await setup();

      dojo.level = 'owner';
      dojo.source = await appTarball();
      dojo.dataZip = zipOf({ 'frogbot.db': 'x', '../escape.txt': 'bad' });

      const result = await run(['deals', '--data']);

      expect(result.code).toBe(1);
      expect(result.stderr()).toEqual([
        "[frogbot] Couldn't unpack the app's data: it names a file outside the folder: ../escape.txt.",
      ]);
      expect(await readdir(cwd)).toEqual([]);
    });
  });
});
