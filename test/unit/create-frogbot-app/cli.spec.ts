import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const cli = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../packages/create-frogbot-app/bin.js',
);
const lockfiles = { npm: 'package-lock.json', pnpm: 'pnpm-lock.yaml' } as const;

let root: string;
let fakeBin: string;
let gitConfig: string;

function writeFakeManager(name: string, script: string): void {
  const file = path.join(fakeBin, name);

  fs.writeFileSync(file, `#!/bin/sh\n${script}\n`);
  fs.chmodSync(file, 0o755);
}

function createApp(argv: string[], env: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(process.execPath, [cli, ...argv], {
    cwd: root,
    encoding: 'utf8',
    env: {
      GIT_AUTHOR_EMAIL: 'test@frogbot.test',
      GIT_AUTHOR_NAME: 'FrogBot Test',
      GIT_COMMITTER_EMAIL: 'test@frogbot.test',
      GIT_COMMITTER_NAME: 'FrogBot Test',
      GIT_CONFIG_GLOBAL: gitConfig,
      GIT_CONFIG_NOSYSTEM: '1',
      HOME: root,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
      ...env,
    },
  });

  return { status: result.status, stderr: result.stderr, stdout: result.stdout };
}

function git(directory: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: gitConfig, GIT_CONFIG_NOSYSTEM: '1' },
  }).trim();
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'create-frogbot-app-cli-'));
  fakeBin = path.join(root, 'bin');
  gitConfig = path.join(root, 'gitconfig');

  fs.mkdirSync(fakeBin);
  fs.writeFileSync(gitConfig, '');
});

afterEach(() => {
  fs.chmodSync(root, 0o755);
  fs.rmSync(root, { recursive: true, force: true });
});

describe.skipIf(process.platform === 'win32')('create-frogbot-app command', () => {
  it.each(['npm', 'pnpm'] as const)(
    'commits the %s lockfile in the initial commit and leaves a clean tree',
    (manager) => {
      writeFakeManager(manager, `echo lockfile > ${lockfiles[manager]}`);

      const result = createApp(['my-app', '--yes', `--use-${manager}`]);
      const app = path.join(root, 'my-app');

      expect(result.status, result.stderr).toBe(0);
      expect(git(app, ['ls-files']).split('\n')).toContain(lockfiles[manager]);
      expect(git(app, ['log', '--pretty=%s'])).toBe('Initial commit from Create FrogBot App');
      expect(git(app, ['status', '--porcelain'])).toBe('');
    },
  );

  it('stops before git when the install fails and keeps the scaffold', () => {
    writeFakeManager('npm', 'echo "npm error network" >&2\nexit 1');

    const result = createApp(['my-app', '--yes', '--use-npm']);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe(
      'npm error network\n[create-frogbot-app] error: npm install failed. Git was not initialized. Fix the error above, then run npm install in my-app.\n',
    );
    expect(fs.existsSync(path.join(root, 'my-app', 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'my-app', '.git'))).toBe(false);
  });

  it.each([
    [
      ['one', '--name', 'two'],
      'Provide the project name once, either positionally or with --name.',
    ],
    [['my-app', '--use-npm', '--use-pnpm'], 'Choose only one package manager.'],
    [['--yes'], 'A project name is required. Pass --name <name>.'],
    [
      ['Bad-Name', '--yes'],
      'Invalid project name "Bad-Name". Use lowercase letters, numbers, dots, dashes, or underscores, starting with a letter or number.',
    ],
    [
      ['my-app', '--yes', '--db', 'oracle'],
      'Unknown database "oracle". Valid values: sqlite, postgres, mongodb.',
    ],
    [
      ['my-app', '--yes', '--template', 'missing'],
      'Unknown template "missing". Valid templates: blank.',
    ],
    [
      ['my-app', '--unknown'],
      "Unknown option '--unknown'. Run create-frogbot-app --help to see all options.",
    ],
    [
      ['my-app', '--ai'],
      "Option '--ai <value>' argument missing. Run create-frogbot-app --help to see all options.",
    ],
  ])('prints one line without a stack trace for %j', (argv, message) => {
    const result = createApp(argv);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe(`[create-frogbot-app] error: ${message}\n`);
  });

  it('prints one line when the directory already exists', () => {
    fs.mkdirSync(path.join(root, 'my-app'));

    const result = createApp(['my-app', '--yes', '--no-install', '--no-git']);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe('[create-frogbot-app] error: Directory "my-app" already exists.\n');
  });

  it.skipIf(process.getuid?.() === 0)('keeps the stack trace for an unexpected error', () => {
    fs.chmodSync(root, 0o555);

    const result = createApp(['my-app', '--yes', '--no-install', '--no-git']);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^\[create-frogbot-app\] error: Error: EACCES/);
    expect(result.stderr).toMatch(/\n {4}at /);
  });

  it('reports an environment key without copying it to .env', () => {
    const result = createApp(['my-app', '--yes', '--no-install', '--no-git'], {
      OPENAI_API_KEY: 'sk-env',
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      'Found OPENAI_API_KEY in your environment but did not copy it to my-app/.env. Add it there, or scaffold with --api-key.',
    );
    expect(fs.readFileSync(path.join(root, 'my-app', '.env'), 'utf8')).toContain(
      'OPENAI_API_KEY=\n',
    );
  });

  it('writes --api-key to .env even when the environment has a key', () => {
    const result = createApp(
      ['my-app', '--yes', '--no-install', '--no-git', '--api-key', 'sk-flag'],
      { OPENAI_API_KEY: 'sk-env' },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain('OPENAI_API_KEY');
    expect(fs.readFileSync(path.join(root, 'my-app', '.env'), 'utf8')).toContain(
      'OPENAI_API_KEY=sk-flag\n',
    );
  });
});
