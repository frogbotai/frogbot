import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { initializeGit } from '../../../packages/create-frogbot-app/src/lib/git.js';

const roots: string[] = [];
const gitEnvironment = {
  GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL,
  GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME,
  GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL,
  GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME,
};

function restoreEnvironment(): void {
  for (const [name, value] of Object.entries(gitEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function createDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'create-frogbot-app-git-'));

  roots.push(directory);

  return directory;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });

  restoreEnvironment();
});

describe('git initialization', () => {
  it('creates a main repository and initial commit', () => {
    const directory = createDirectory();

    fs.writeFileSync(path.join(directory, 'package.json'), '{}\n');

    process.env.GIT_AUTHOR_EMAIL = 'test@frogbot.test';
    process.env.GIT_AUTHOR_NAME = 'FrogBot Test';
    process.env.GIT_COMMITTER_EMAIL = 'test@frogbot.test';
    process.env.GIT_COMMITTER_NAME = 'FrogBot Test';

    expect(initializeGit(directory)).toBe(true);
    expect(
      execFileSync('git', ['branch', '--show-current'], {
        cwd: directory,
        encoding: 'utf8',
      }).trim(),
    ).toBe('main');
    expect(
      execFileSync('git', ['log', '-1', '--pretty=%s'], {
        cwd: directory,
        encoding: 'utf8',
      }).trim(),
    ).toBe('feat: initial commit');
  });

  it('does not create a nested repository inside an existing repository', () => {
    const root = createDirectory();
    const directory = path.join(root, 'app');

    execFileSync('git', ['init', '-b', 'main'], { cwd: root, stdio: 'ignore' });
    fs.mkdirSync(directory);

    expect(initializeGit(directory)).toBe(true);
    expect(fs.existsSync(path.join(directory, '.git'))).toBe(false);
  });
});
