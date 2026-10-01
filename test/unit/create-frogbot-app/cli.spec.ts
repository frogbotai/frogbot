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

function readScaffoldFiles(directory: string): Record<string, string> {
  const files = fs.readdirSync(directory, { recursive: true, withFileTypes: true });

  return Object.fromEntries(
    files
      .filter((file) => file.isFile())
      .map((file) => {
        const filePath = path.join(file.parentPath, file.name);
        const relativePath = path.relative(directory, filePath);
        const content = fs.readFileSync(filePath, 'utf8');

        if (relativePath === 'package.json') {
          const pkg = JSON.parse(content) as Record<string, unknown>;

          delete pkg.name;

          return [relativePath, JSON.stringify(pkg)];
        }

        return [relativePath, content.replace(/^FROGBOT_SECRET=.*$/m, 'FROGBOT_SECRET=')];
      }),
  );
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
    const result = createApp(['my-app', '--yes', '--ai', 'openai', '--no-install', '--no-git'], {
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
      ['my-app', '--yes', '--ai', 'openai', '--no-install', '--no-git', '--api-key', 'sk-flag'],
      { OPENAI_API_KEY: 'sk-env' },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain('OPENAI_API_KEY');
    expect(fs.readFileSync(path.join(root, 'my-app', '.env'), 'utf8')).toContain(
      'OPENAI_API_KEY=sk-flag\n',
    );
  });

  it('--yes --ai zen writes an empty Zen key and warns before chatting', () => {
    const result = createApp(['my-app', '--yes', '--ai', 'zen', '--no-install', '--no-git']);

    const app = path.join(root, 'my-app');
    const env = fs.readFileSync(path.join(app, '.env'), 'utf8');
    const config = fs.readFileSync(path.join(app, 'src', 'frogbot.config.ts'), 'utf8');

    expect(result.status, result.stderr).toBe(0);
    expect(env).toContain('OPENCODE_API_KEY=\n');
    expect(config).toContain("defaultModel: 'zen/deepseek-v4.1-flash'");
    expect(config).toContain("type: 'openai-compatible'");
    expect(config).toContain("baseUrl: 'https://opencode.ai/zen/v1'");
    expect(config).toContain('apiKey: process.env.OPENCODE_API_KEY');
    expect(config).not.toContain("apiKey: 'public'");
    expect(result.stdout).toContain('Set OPENCODE_API_KEY in my-app/.env before chatting.');
  });

  it('--yes without --ai creates an app with no AI provider and ignores --api-key', () => {
    const result = createApp(
      ['my-app', '--yes', '--no-install', '--no-git', '--api-key', 'sk-flag'],
      { OPENAI_API_KEY: 'sk-env' },
    );

    const app = path.join(root, 'my-app');
    const env = fs.readFileSync(path.join(app, '.env'), 'utf8');
    const config = fs.readFileSync(path.join(app, 'src', 'frogbot.config.ts'), 'utf8');

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain('Found OPENAI_API_KEY');
    expect(result.stdout).toContain('https://docs.frogbot.ai/ai/overview');
    expect(env).not.toContain('OPENAI_API_KEY');
    expect(env).not.toContain('sk-flag');
    expect(config).not.toContain('ai:');
  });

  it('a run without a terminal and without --ai creates an app with no AI provider', () => {
    const result = createApp(['my-app', '--no-install', '--no-git']);

    const config = fs.readFileSync(path.join(root, 'my-app', 'src', 'frogbot.config.ts'), 'utf8');

    expect(result.status, result.stderr).toBe(0);
    expect(config).not.toContain('ai:');
  });

  it('--yes without --ai creates the same files as --ai none', () => {
    const defaultResult = createApp(['default-app', '--yes', '--no-install', '--no-git']);
    const noneResult = createApp(['none-app', '--yes', '--ai', 'none', '--no-install', '--no-git']);

    expect(defaultResult.status, defaultResult.stderr).toBe(0);
    expect(noneResult.status, noneResult.stderr).toBe(0);

    const defaultFiles = readScaffoldFiles(path.join(root, 'default-app'));
    const noneFiles = readScaffoldFiles(path.join(root, 'none-app'));

    expect(Object.keys(defaultFiles).sort()).toEqual(Object.keys(noneFiles).sort());
    expect(defaultFiles).toEqual(noneFiles);
  });
});
