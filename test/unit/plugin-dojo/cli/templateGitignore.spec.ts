import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { git, gitRepo, tempDir, writeFiles } from './helpers.js';

const templateGitignore = fileURLToPath(
  new URL('../../../../templates/blank/.gitignore', import.meta.url),
);

describe('template .gitignore', () => {
  it('keeps uploads, env files and the Dojo link out of git, but not .env.example', async () => {
    const root = await tempDir();

    await gitRepo(root);
    await copyFile(templateGitignore, join(root, '.gitignore'));
    await git(root, 'add', '.gitignore');
    await git(root, 'commit', '-qm', 'init');

    await writeFiles(root, {
      'files/a.png': '',
      '.env.production': 'STRIPE_KEY=sk_live',
      '.env': 'STRIPE_KEY=sk_test',
      '.frogbot/app.json': '{"appId":"1"}',
      'frogbot.db': '',
    });

    expect(await git(root, 'status', '--porcelain')).toBe('');

    await writeFiles(root, { '.env.example': 'STRIPE_KEY=' });

    expect(await git(root, 'status', '--porcelain')).toBe('?? .env.example\n');
  });
});
