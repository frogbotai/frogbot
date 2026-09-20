import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  applyLocalOverrides,
  packLocalClosure,
  run,
  serviceAvailable,
  type LocalPackage,
} from './fixtures/create-frogbot-app/harness';
import { terminateProcess } from './process';

const RUN_E2E = process.env.RUN_E2E === '1';
const RUN_COMPILER_CHECKS = process.env.RUN_COMPILER_CHECKS === '1';
const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const cli = path.join(repoRoot, 'packages', 'create-frogbot-app', 'bin.js');
const cliPackage = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'packages', 'create-frogbot-app', 'package.json'), 'utf8'),
) as { version: string };
const postgresAvailable = RUN_E2E ? await serviceAvailable(5433) : false;
const mongodbAvailable = RUN_E2E ? await serviceAvailable(27018) : false;

function ephemeralPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        reject(new Error('Could not allocate an HTTP port.'));
        return;
      }

      server.close(() => resolve(address.port));
    });
  });
}

async function bootApp(directory: string, databaseUrl?: string): Promise<void> {
  const port = await ephemeralPort();
  const child = spawn(
    process.execPath,
    [
      path.join(directory, 'node_modules', 'next', 'dist', 'bin', 'next'),
      'dev',
      '--port',
      String(port),
    ],
    {
      cwd: directory,
      detached: true,
      env: {
        ...process.env,
        ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  );
  let errors = '';

  child.stderr?.on('data', (chunk: Buffer) => {
    errors += chunk.toString();
  });

  try {
    const deadline = Date.now() + 90000;

    for (;;) {
      if (child.exitCode !== null)
        throw new Error(`Generated app exited with ${child.exitCode}:\n${errors}`);

      const response = await fetch(`http://127.0.0.1:${port}/api/users/me`).catch(() => undefined);

      if (response?.status === 200) return;

      if (Date.now() > deadline) throw new Error(`Generated app did not become ready:\n${errors}`);

      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } finally {
    await terminateProcess(child);
  }
}

interface AppCase {
  ai: 'none' | 'zen';
  database: 'mongodb' | 'postgres' | 'sqlite';
  name: string;
}

const cases: AppCase[] = [
  { ai: 'zen', database: 'sqlite', name: 'sqlite-zen' },
  { ai: 'none', database: 'sqlite', name: 'sqlite-none' },
  { ai: 'none', database: 'postgres', name: 'postgres-none' },
  { ai: 'none', database: 'mongodb', name: 'mongodb-none' },
];

function databaseEnvironment(appCase: AppCase): NodeJS.ProcessEnv {
  if (appCase.database === 'postgres') {
    return { DATABASE_URL: 'postgres://frogbot:frogbot@127.0.0.1:5433/frogbot' };
  }

  if (appCase.database === 'mongodb') {
    return {
      DATABASE_URL: 'mongodb://127.0.0.1:27018/frogbot-test?directConnection=true&replicaSet=rs0',
    };
  }

  return {};
}

describe.skipIf(!RUN_E2E)('create-frogbot-app generated applications', () => {
  let root: string;
  let localPackages: LocalPackage[];
  const appDirectories = new Map<string, string>();

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'create-frogbot-app-e2e-'));

    for (const appCase of cases) {
      const result = run(
        process.execPath,
        [
          cli,
          appCase.name,
          '--yes',
          '--no-git',
          '--no-install',
          '--db',
          appCase.database,
          '--ai',
          appCase.ai,
        ],
        { cwd: root },
      );

      expect(result.status, result.output).toBe(0);
      appDirectories.set(appCase.name, path.join(root, appCase.name));
    }

    const firstApp = appDirectories.get('sqlite-zen')!;
    const firstPackage = JSON.parse(
      fs.readFileSync(path.join(firstApp, 'package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> };

    for (const [name, version] of Object.entries(firstPackage.dependencies)) {
      if (name === 'frogbot' || name.startsWith('@frogbotai/'))
        expect(version).toBe(`^${cliPackage.version}`);
    }

    localPackages = packLocalClosure({
      appDirectories: [...appDirectories.values()],
      outputDirectory: path.join(root, 'packages'),
      repoRoot,
    });

    for (const directory of appDirectories.values()) applyLocalOverrides(directory, localPackages);
  }, 240000);

  afterAll(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it('packs the complete local FrogBot dependency closure with publish exports', () => {
    const names = localPackages.map(({ name }) => name);

    expect(names).toContain('frogbot');
    expect(names).toContain('@frogbotai/gateway');
    expect(names).toContain('@frogbotai/next');
    expect(names).toContain('@frogbotai/richtext-lexical');
    expect(localPackages.every(({ tarball }) => fs.existsSync(tarball))).toBe(true);
  });

  it.each(cases)('scaffolds $name with the selected adapter and AI shape', (appCase) => {
    const directory = appDirectories.get(appCase.name)!;
    const config = fs.readFileSync(path.join(directory, 'src', 'frogbot.config.ts'), 'utf8');
    const env = fs.readFileSync(path.join(directory, '.env'), 'utf8');
    const pkg = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };

    expect(config).toContain('editor: lexicalEditor()');
    expect(pkg.dependencies['@frogbotai/richtext-lexical']).toBe(`^${cliPackage.version}`);

    if (appCase.database === 'sqlite') {
      expect(config).toContain('sqliteAdapter');
      expect(env).toContain('DATABASE_URL=file:./frogbot.db');
    }

    if (appCase.database === 'postgres') {
      expect(config).toContain('postgresAdapter');
      expect(pkg.dependencies.libsql).toBeUndefined();
    }

    if (appCase.database === 'mongodb') {
      expect(config).toContain('mongooseAdapter');
      expect(pkg.dependencies.libsql).toBeUndefined();
      expect(pkg.dependencies['drizzle-kit']).toBeUndefined();
    }

    if (appCase.ai === 'none') {
      expect(config).not.toContain('  ai:');
      expect(config).not.toContain('  agents:');
      expect(fs.existsSync(path.join(directory, 'src', 'agents'))).toBe(false);
    } else {
      expect(config).toContain("defaultModel: 'zen/big-pickle'");
    }
  });

  it.each(cases)(
    'installs $name entirely from controlled local packages',
    (appCase) => {
      const directory = appDirectories.get(appCase.name)!;
      const result = run('pnpm', ['install', '--store-dir', path.join(root, 'store')], {
        cwd: directory,
      });

      expect(result.status, result.output).toBe(0);
    },
    120000,
  );

  it.each(['sqlite-zen', 'sqlite-none'])(
    'loads config and generates types for %s',
    (name) => {
      const directory = appDirectories.get(name)!;
      const result = run('pnpm', ['generate:types'], { cwd: directory });

      expect(result.status, result.output).toBe(0);
      expect(fs.existsSync(path.join(directory, 'src', 'frogbot-types.ts'))).toBe(true);

      if (name === 'sqlite-zen') {
        const generatedTypes = fs.readFileSync(
          path.join(directory, 'src', 'frogbot-types.ts'),
          'utf8',
        );

        expect(generatedTypes).toContain("models: 'zen/big-pickle'");
      }
    },
    120000,
  );

  it.skipIf(!postgresAvailable)(
    'loads the Postgres config and generates types',
    () => {
      const directory = appDirectories.get('postgres-none')!;
      const result = run('pnpm', ['generate:types'], {
        cwd: directory,
        env: { DATABASE_URL: 'postgres://frogbot:frogbot@127.0.0.1:5433/frogbot' },
      });

      expect(result.status, result.output).toBe(0);
      expect(fs.existsSync(path.join(directory, 'src', 'frogbot-types.ts'))).toBe(true);
    },
    120000,
  );

  it.skipIf(!mongodbAvailable)(
    'loads the MongoDB config and generates types',
    () => {
      const directory = appDirectories.get('mongodb-none')!;
      const result = run('pnpm', ['generate:types'], {
        cwd: directory,
        env: {
          DATABASE_URL:
            'mongodb://127.0.0.1:27018/frogbot-test?directConnection=true&replicaSet=rs0',
        },
      });

      expect(result.status, result.output).toBe(0);
      expect(fs.existsSync(path.join(directory, 'src', 'frogbot-types.ts'))).toBe(true);
    },
    120000,
  );

  describe.skipIf(!RUN_COMPILER_CHECKS)('generated application compiler acceptance', () => {
    it.each(cases)(
      'typechecks the complete $name application',
      (appCase) => {
        const result = run('pnpm', ['typecheck'], {
          cwd: appDirectories.get(appCase.name)!,
          env: databaseEnvironment(appCase),
        });

        expect(result.status, result.output).toBe(0);
      },
      120000,
    );

    it.each(cases)(
      'builds the complete $name application for production',
      (appCase) => {
        const result = run('pnpm', ['build'], {
          cwd: appDirectories.get(appCase.name)!,
          env: databaseEnvironment(appCase),
        });

        expect(result.status, result.output).toBe(0);
      },
      240000,
    );
  });

  it.each(['sqlite-zen', 'sqlite-none'])(
    'boots the generated %s application',
    async (name) => {
      await bootApp(appDirectories.get(name)!);
    },
    120000,
  );

  it.skipIf(!postgresAvailable)(
    'boots the generated Postgres application',
    async () => {
      await bootApp(
        appDirectories.get('postgres-none')!,
        'postgres://frogbot:frogbot@127.0.0.1:5433/frogbot',
      );
    },
    120000,
  );

  it.skipIf(!mongodbAvailable)(
    'boots the generated MongoDB application',
    async () => {
      await bootApp(
        appDirectories.get('mongodb-none')!,
        'mongodb://127.0.0.1:27018/frogbot-test?directConnection=true&replicaSet=rs0',
      );
    },
    120000,
  );

  it('completes after a controlled CLI dependency installation', () => {
    const fakeBin = path.join(root, 'successful-bin');
    const fakePnpm = path.join(fakeBin, 'pnpm');
    const appName = 'install-success';

    fs.mkdirSync(fakeBin);
    fs.writeFileSync(fakePnpm, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(fakePnpm, 0o755);

    const result = run(process.execPath, [cli, appName, '--yes', '--no-git', '--use-pnpm'], {
      cwd: root,
      env: { PATH: fakeBin },
    });

    expect(result.status, result.output).toBe(0);
    expect(result.output).not.toContain('Install failed');
    expect(fs.existsSync(path.join(root, appName, 'package.json'))).toBe(true);
  });

  it('keeps a completed scaffold when dependency installation fails', () => {
    const fakeBin = path.join(root, 'fake-bin');
    const appName = 'install-failure';

    fs.mkdirSync(fakeBin);

    const result = run(process.execPath, [cli, appName, '--yes', '--no-git', '--use-npm'], {
      cwd: root,
      env: { PATH: fakeBin },
    });

    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain('Install failed');
    expect(fs.existsSync(path.join(root, appName, 'package.json'))).toBe(true);
  });

  it('warns without writing pointers when the bundled skill is absent', () => {
    const appName = 'missing-skill';
    const result = run(
      process.execPath,
      [cli, appName, '--yes', '--no-git', '--no-install', '--agents', 'claude'],
      { cwd: root },
    );

    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain('skill is not bundled');
    expect(fs.existsSync(path.join(root, appName, 'CLAUDE.md'))).toBe(false);
    expect(fs.existsSync(path.join(root, appName, '.claude'))).toBe(false);
  });

  it.each([
    [
      ['invalid-template', '--yes', '--no-git', '--no-install', '--template', 'missing'],
      'Valid templates: blank',
    ],
    [
      ['invalid-database', '--yes', '--no-git', '--no-install', '--db', 'oracle'],
      'Valid values: sqlite, postgres, mongodb',
    ],
    [
      ['invalid-ai', '--yes', '--no-git', '--no-install', '--ai', 'local'],
      'Valid values: zen, openai, anthropic, google, bedrock, none',
    ],
    [
      ['invalid-agent', '--yes', '--no-git', '--no-install', '--agents', 'unknown'],
      'Valid values: claude, codex, cursor, opencode, copilot, gemini',
    ],
    [['unknown-option', '--yes', '--not-a-flag'], 'Unknown option'],
  ])('rejects invalid CLI input without partial writes', (argv, message) => {
    const result = run(process.execPath, [cli, ...argv], { cwd: root });

    expect(result.status).toBe(1);
    expect(result.output).toContain(message);
    expect(fs.existsSync(path.join(root, argv[0]))).toBe(false);
  });

  it('rejects non-interactive input without a project name', () => {
    const result = run(process.execPath, [cli], { cwd: root });

    expect(result.status).toBe(1);
    expect(result.output).toContain('--name');
  });

  it('leaves an existing destination untouched', () => {
    const appName = 'existing-app';
    const directory = path.join(root, appName);
    const sentinel = path.join(directory, 'sentinel');

    fs.mkdirSync(directory);
    fs.writeFileSync(sentinel, 'unchanged');

    const result = run(process.execPath, [cli, appName, '--yes', '--no-git', '--no-install'], {
      cwd: root,
    });

    expect(result.status).toBe(1);
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('unchanged');
    expect(fs.readdirSync(directory)).toEqual(['sentinel']);
  });

  it('keeps a completed scaffold when git is unavailable', () => {
    const fakeBin = path.join(root, 'no-git-bin');
    const appName = 'git-failure';

    fs.mkdirSync(fakeBin);

    const result = run(process.execPath, [cli, appName, '--yes', '--no-install'], {
      cwd: root,
      env: { PATH: fakeBin },
    });

    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain('Could not initialize git');
    expect(fs.existsSync(path.join(root, appName, 'package.json'))).toBe(true);
  });
});
