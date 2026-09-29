import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { initializeGit } from '../../../packages/create-frogbot-app/src/lib/git.js';

const roots: string[] = [];
const gitEnvironmentNames = [
  'GIT_AUTHOR_EMAIL',
  'GIT_AUTHOR_NAME',
  'GIT_COMMITTER_EMAIL',
  'GIT_COMMITTER_NAME',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_NOSYSTEM',
];
const gitEnvironment = Object.fromEntries(
  gitEnvironmentNames.map((name) => [name, process.env[name]]),
);

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

function writeGlobalConfig(config: string): void {
  const file = path.join(createDirectory(), 'gitconfig');

  fs.writeFileSync(file, config);
  process.env.GIT_CONFIG_GLOBAL = file;
}

function git(directory: string, args: string[]): string {
  return execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();
}

beforeEach(() => {
  process.env.GIT_AUTHOR_EMAIL = 'test@frogbot.test';
  process.env.GIT_AUTHOR_NAME = 'FrogBot Test';
  process.env.GIT_COMMITTER_EMAIL = 'test@frogbot.test';
  process.env.GIT_COMMITTER_NAME = 'FrogBot Test';
  process.env.GIT_CONFIG_NOSYSTEM = '1';

  writeGlobalConfig('');
});

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });

  restoreEnvironment();
});

describe('git initialization', () => {
  it('creates a main repository and initial commit', () => {
    const directory = createDirectory();

    fs.writeFileSync(path.join(directory, 'package.json'), '{}\n');

    expect(initializeGit(directory)).toBe(true);
    expect(git(directory, ['branch', '--show-current'])).toBe('main');
    expect(git(directory, ['log', '-1', '--pretty=%s'])).toBe(
      'Initial commit from Create FrogBot App',
    );
    expect(git(directory, ['status', '--porcelain'])).toBe('');
  });

  it('keeps the configured default branch', () => {
    const directory = createDirectory();

    writeGlobalConfig('[init]\n\tdefaultBranch = trunk\n');
    fs.writeFileSync(path.join(directory, 'package.json'), '{}\n');

    expect(initializeGit(directory)).toBe(true);
    expect(git(directory, ['branch', '--show-current'])).toBe('trunk');
  });

  it('removes the new repository when the initial commit fails', () => {
    const directory = createDirectory();
    const hooks = path.join(createDirectory(), 'hooks');

    fs.mkdirSync(hooks);
    fs.writeFileSync(path.join(hooks, 'pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    writeGlobalConfig(`[core]\n\thooksPath = ${hooks}\n`);
    fs.writeFileSync(path.join(directory, 'package.json'), '{}\n');

    expect(initializeGit(directory)).toBe(false);
    expect(fs.existsSync(path.join(directory, '.git'))).toBe(false);
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
