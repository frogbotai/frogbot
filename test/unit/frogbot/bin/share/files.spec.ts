import { rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ShareCollection } from '../../../../../packages/frogbot/src/bin/share/files.js';
import { shareFiles } from '../../../../../packages/frogbot/src/bin/share/files.js';
import { git, gitRepo, tempDir, writeFiles } from './helpers.js';

const collections: ShareCollection[] = [
  { slug: 'posts' },
  { slug: 'files', upload: { staticDir: 'files' } },
  { slug: 'images', upload: { staticDir: 'media' } },
  { slug: 'avatars', upload: {} },
  { slug: 'remote', upload: { staticDir: 'src', disableLocalStorage: true } },
];

const databaseUrl = 'file:./data/my.db';

const shipped = {
  'package.json': '{"name":"deals"}',
  'pnpm-lock.yaml': '',
  'src/frogbot.config.ts': 'export default {};',
  'src/page.tsx': 'old',
  'data/seed.json': '[]',
};

const neverShipped = {
  '.env.example': 'STRIPE_KEY=',
  '.env.production': 'STRIPE_KEY=sk_live',
  '.frogbot/app.json': '{"appId":"1"}',
  'frogbot.db': '',
  'frogbot.db-wal': '',
  'x.sqlite': '',
  'data/my.db': '',
  'data/my.db-journal': '',
  'files/a.png': '',
  'media/b.png': '',
  'avatars/c.png': '',
  'node_modules/x/index.js': '',
  '.next/y': '',
  'packages/ui/node_modules/z.js': '',
};

describe('shareFiles', () => {
  it('ships the working files of a git repo, not the last commit', async () => {
    const root = await tempDir();

    await gitRepo(root);
    await writeFiles(root, { ...shipped, ...neverShipped, 'src/gone.ts': '' });
    await git(root, 'add', '-f', '.');
    await git(root, 'commit', '-qm', 'init');

    await writeFile(join(root, 'src/page.tsx'), 'new');
    await writeFiles(root, { 'src/new.tsx': '' });
    await rm(join(root, 'src/gone.ts'));

    const { files } = await shareFiles({ root, collections, databaseUrl });

    expect(files.sort()).toEqual([...Object.keys(shipped), 'src/new.tsx'].sort());
  });

  it('leaves out files git ignores, and names the symlinks it leaves out', async () => {
    const root = await tempDir();

    await gitRepo(root);
    await writeFiles(root, { ...shipped, '.gitignore': 'dist\n', 'dist/out.js': '' });
    await symlink(join(root, 'package.json'), join(root, 'link.json'));
    await symlink(join(root, 'src'), join(root, 'source'));

    const { files, symlinks } = await shareFiles({ root, collections, databaseUrl });

    expect(files.sort()).toEqual([...Object.keys(shipped), '.gitignore'].sort());
    expect(symlinks.sort()).toEqual(['link.json', 'source']);
  });

  it('leaves out a tracked file reached through a folder later swapped for a symlink', async () => {
    const root = await tempDir();
    const outside = await tempDir();

    await gitRepo(root);
    await writeFiles(root, { ...shipped, 'cfg/a.txt': 'tracked' });
    await git(root, 'add', '-A');
    await writeFiles(outside, { 'a.txt': 'secret' });
    await rm(join(root, 'cfg'), { recursive: true });
    await symlink(outside, join(root, 'cfg'));

    const { files, symlinks } = await shareFiles({ root, collections, databaseUrl });

    expect(files.sort()).toEqual(Object.keys(shipped).sort());
    expect(symlinks.sort()).toEqual(['cfg', 'cfg/a.txt']);
  });

  it('never ships the login file, even inside the app', async () => {
    const root = await tempDir();

    await gitRepo(root);
    await writeFiles(root, { ...shipped, 'config/frogbotai/auth.json': '{"tokens":{}}' });

    const { files } = await shareFiles({
      root,
      collections,
      databaseUrl,
      authFile: join(root, 'config/frogbotai/auth.json'),
    });

    expect(files.sort()).toEqual(Object.keys(shipped).sort());
  });

  it('keeps .env files out in every spelling and place, even un-ignored', async () => {
    for (const useGit of [true, false]) {
      const root = await tempDir();

      await writeFiles(root, {
        ...shipped,
        '.gitignore': '!.env\n!.env.local\n',
        '.env/secret.txt': 's',
        'apps/web/.env.local': 's',
        '.ENV.local': 's',
        '.Env.Production': 's',
        '.env ': 's',
        'src/.envrc': 's',
      });

      if (useGit) {
        await gitRepo(root);
        await git(root, 'add', '-Af');
      }

      const { files } = await shareFiles({ root, collections, databaseUrl });

      expect(files.sort()).toEqual([...Object.keys(shipped), '.gitignore'].sort());
    }
  });

  it('names the symlinks it leaves out without git', async () => {
    const root = await tempDir();

    await writeFiles(root, shipped);
    await symlink(join(root, 'package.json'), join(root, 'link.json'));

    const { files, symlinks } = await shareFiles({ root, collections, databaseUrl });

    expect(files.sort()).toEqual(Object.keys(shipped).sort());
    expect(symlinks).toEqual(['link.json']);
  });

  it('ships a path starting with @, and a file named ...', async () => {
    const root = await tempDir();

    await gitRepo(root);
    await writeFiles(root, { ...shipped, '@types/env.d.ts': '', '@notes': '', '...': '' });

    const { files } = await shareFiles({ root, collections, databaseUrl });

    expect(files.sort()).toEqual(
      [...Object.keys(shipped), '@types/env.d.ts', '@notes', '...'].sort(),
    );
  });

  it('lists only the app folder inside a larger repo', async () => {
    const repo = await tempDir();
    const root = join(repo, 'apps/deals');

    await gitRepo(repo);
    await writeFiles(repo, { 'README.md': '' });
    await writeFiles(root, shipped);

    const { files } = await shareFiles({ root, collections, databaseUrl });

    expect(files.sort()).toEqual(Object.keys(shipped).sort());
  });

  it('honours nested .gitignore files without git', async () => {
    const root = await tempDir();

    await writeFiles(root, {
      ...shipped,
      ...neverShipped,
      '.gitignore': 'dist\n*.log\n',
      'dist/out.js': '',
      'debug.log': '',
      'src/.gitignore': 'generated/\n!keep.log\n',
      'src/generated/a.ts': '',
      'src/keep.log': '',
      'generated/b.ts': '',
    });

    const { files } = await shareFiles({ root, collections, databaseUrl });

    expect(files.sort()).toEqual(
      [
        ...Object.keys(shipped),
        '.gitignore',
        'src/.gitignore',
        'src/keep.log',
        'generated/b.ts',
      ].sort(),
    );
  });

  it('accepts a file:// database URL and ignores a database outside the app', async () => {
    const root = await tempDir();

    await writeFiles(root, { ...shipped, 'db/app.db': '' });

    const inApp = await shareFiles({
      root,
      collections: [],
      databaseUrl: `file://${join(root, 'db/app.db')}`,
    });

    const outside = await shareFiles({
      root,
      collections: [],
      databaseUrl: 'file:../elsewhere.db',
    });

    expect(inApp.files).not.toContain('db/app.db');
    expect(outside.files.sort()).toEqual([...Object.keys(shipped), 'db/app.db'].sort());
  });
});
