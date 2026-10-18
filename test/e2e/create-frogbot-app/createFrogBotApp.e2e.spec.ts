import fs from 'node:fs';
import http from 'node:http';
import type net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, expect, it, onTestFinished } from 'vitest';

import { createPostgresDatabase } from '../../__helpers/shared/db/postgres';
import { getFreePort, spawnServer, terminateProcess, waitForServer } from '../process';
import {
  applyLocalOverrides,
  copyCLIWithoutSkill,
  type LocalPackage,
  packLocalClosure,
  run,
  runSetup,
  serviceAvailable,
  subprocessEnvironment,
} from './harness';

const { catalogVersion } = (await import(
  pathToFileURL(path.resolve(import.meta.dirname, '../../../scripts/lib/workspace.mjs')).href
)) as { catalogVersion: (name: string) => string };

const RUN_E2E = process.env.RUN_E2E === '1';
const RUN_COMPILER_CHECKS = process.env.RUN_COMPILER_CHECKS === '1';
const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const cli = path.join(repoRoot, 'packages', 'create-frogbot-app', 'bin.js');
const cliPackage = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'packages', 'create-frogbot-app', 'package.json'), 'utf8'),
) as { version: string };

const postgresAvailable = RUN_E2E ? await serviceAvailable(5433) : false;
const mongodbAvailable = RUN_E2E ? await serviceAvailable(27018) : false;

async function expectAppBoots(directory: string, databaseUrl?: string): Promise<void> {
  const port = await getFreePort();
  const child = spawnServer(
    process.execPath,
    [
      path.join(directory, 'node_modules', 'next', 'dist', 'bin', 'next'),
      'dev',
      '--port',
      String(port),
    ],
    {
      cwd: directory,
      env: subprocessEnvironment(directory, databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
    },
  );

  let output = '';

  for (const stream of [child.stdout, child.stderr]) {
    stream?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
  }

  try {
    await waitForServer(
      child,
      async () => {
        const response = await fetch(`http://127.0.0.1:${port}/api/users/me`, {
          signal: AbortSignal.timeout(10000),
        }).catch(() => undefined);

        return response?.status === 200;
      },
      { name: 'Generated app', timeout: 90000, interval: 500, output: () => output },
    );
  } finally {
    await terminateProcess(child);
  }
}

interface AppCase {
  ai: 'none' | 'zen';
  database: 'mongodb' | 'postgres' | 'sqlite';
  name: string;
  configIncludes: string[];
  configExcludes: string[];
  envIncludes: string[];
  absentDependencies: string[];
  absentPaths: string[];
}

const sqliteEnv = ['DATABASE_URL=file:./frogbot.db'];
const noAIConfig = ['  ai:', '  agents:'];

const cases: AppCase[] = [
  {
    ai: 'zen',
    database: 'sqlite',
    name: 'sqlite-zen',
    configIncludes: ['sqliteAdapter', "defaultModel: 'zen/deepseek-v4.1-flash'"],
    configExcludes: [],
    envIncludes: sqliteEnv,
    absentDependencies: [],
    absentPaths: [],
  },
  {
    ai: 'none',
    database: 'sqlite',
    name: 'sqlite-none',
    configIncludes: ['sqliteAdapter'],
    configExcludes: noAIConfig,
    envIncludes: sqliteEnv,
    absentDependencies: [],
    absentPaths: ['src/agents'],
  },
  {
    ai: 'none',
    database: 'postgres',
    name: 'postgres-none',
    configIncludes: ['postgresAdapter'],
    configExcludes: noAIConfig,
    envIncludes: [],
    absentDependencies: ['libsql'],
    absentPaths: ['src/agents'],
  },
  {
    ai: 'none',
    database: 'mongodb',
    name: 'mongodb-none',
    configIncludes: ['mongooseAdapter'],
    configExcludes: noAIConfig,
    envIncludes: [],
    absentDependencies: ['libsql', 'drizzle-kit'],
    absentPaths: ['src/agents'],
  },
];

let postgresDatabase: Awaited<ReturnType<typeof createPostgresDatabase>> | undefined;

function postgresURL(): string {
  if (!postgresDatabase) throw new Error('The Postgres test database was not created');

  return postgresDatabase.url.toString();
}

function databaseEnvironment(appCase: AppCase): NodeJS.ProcessEnv {
  if (appCase.database === 'postgres') return { DATABASE_URL: postgresURL() };

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

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'create-frogbot-app-e2e-'));

    if (postgresAvailable) postgresDatabase = await createPostgresDatabase('create_frogbot_app');

    for (const appCase of cases) {
      runSetup(
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

      appDirectories.set(appCase.name, path.join(root, appCase.name));
    }

    if (RUN_COMPILER_CHECKS) {
      runSetup(
        process.execPath,
        [cli, 'sqlite-files', '--yes', '--no-git', '--no-install', '--db', 'sqlite', '--ai', 'zen'],
        { cwd: root },
      );

      appDirectories.set('sqlite-files', path.join(root, 'sqlite-files'));
    }

    localPackages = packLocalClosure({
      appDirectories: [...appDirectories.values()],
      outputDirectory: path.join(root, 'packages'),
      repoRoot,
    });

    for (const directory of appDirectories.values()) applyLocalOverrides(directory, localPackages);
  }, 240000);

  afterAll(async () => {
    await postgresDatabase?.drop();
    postgresDatabase = undefined;

    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it('pins generated FrogBot dependencies to the CLI version', () => {
    const firstPackage = JSON.parse(
      fs.readFileSync(path.join(appDirectories.get('sqlite-zen')!, 'package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> };

    const frogbotDependencies = Object.keys(firstPackage.dependencies).filter(
      (name) => name === 'frogbot' || name.startsWith('@frogbotai/'),
    );

    expect(frogbotDependencies.map((name) => firstPackage.dependencies[name])).toEqual(
      frogbotDependencies.map(() => `^${cliPackage.version}`),
    );
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

    for (const text of appCase.configIncludes) expect(config).toContain(text);

    for (const text of appCase.configExcludes) expect(config).not.toContain(text);

    for (const line of appCase.envIncludes) expect(env).toContain(line);

    for (const name of appCase.absentDependencies) {
      expect(pkg.dependencies).not.toHaveProperty(name);
    }

    for (const file of appCase.absentPaths) {
      expect(fs.existsSync(path.join(directory, file))).toBe(false);
    }

    const adapter = JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, 'packages', `db-${appCase.database}`, 'package.json'),
        'utf8',
      ),
    ) as { dependencies: Record<string, string> };

    const runtime = Object.entries(adapter.dependencies)
      .filter(([, version]) => !version.startsWith('workspace:'))
      .map(([name, version]) => [name, version === 'catalog:' ? catalogVersion(name) : version]);

    expect(runtime.map(([name]) => [name, pkg.dependencies[name]])).toEqual(runtime);
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

  it.each([
    { name: 'sqlite-zen', generated: ["models: 'zen/deepseek-v4.1-flash'"] },
    { name: 'sqlite-none', generated: [] },
  ])(
    'loads config and generates types for $name',
    ({ name, generated }) => {
      const directory = appDirectories.get(name)!;
      const result = run('pnpm', ['generate:types'], { cwd: directory });

      expect(result.status, result.output).toBe(0);
      expect(fs.existsSync(path.join(directory, 'src', 'frogbot-types.ts'))).toBe(true);

      const generatedTypes = fs.readFileSync(
        path.join(directory, 'src', 'frogbot-types.ts'),
        'utf8',
      );

      for (const text of generated) expect(generatedTypes).toContain(text);
    },
    120000,
  );

  it('frogbot run executes the documented seed in a generated sqlite-none app', () => {
    const directory = appDirectories.get('sqlite-none')!;
    const page = fs.readFileSync(
      path.join(repoRoot, 'docs', 'local-api', 'outside-nextjs.mdx'),
      'utf8',
    );

    const seed = page.match(/```ts\n([\s\S]*?)\n```/)?.[1];

    expect(seed).toBeDefined();

    fs.writeFileSync(path.join(directory, 'src', 'seed.ts'), `${seed}\n`);

    fs.writeFileSync(
      path.join(directory, '.env.local'),
      'DATABASE_URL=file:./run-e2e.db\nFROGBOT_SECRET=frogbot-run-e2e-secret\n',
    );

    const result = run('pnpm', ['exec', 'frogbot', 'run', 'src/seed.ts'], {
      cwd: directory,
      env: { DATABASE_URL: undefined, FROGBOT_SECRET: undefined },
    });

    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain('Created user: dev@frogbot.com');
    expect(fs.existsSync(path.join(directory, 'run-e2e.db'))).toBe(true);
  }, 120000);

  it('frogbot run resolves the documented Drizzle imports in a generated sqlite-none app', () => {
    const directory = appDirectories.get('sqlite-none')!;

    fs.writeFileSync(
      path.join(directory, 'src', 'drizzle-imports.ts'),
      [
        "import { sqliteTable } from 'drizzle-orm/sqlite-core'",
        "import { eq } from '@frogbotai/db-sqlite/drizzle'",
        '',
        'console.log(JSON.stringify([typeof sqliteTable, typeof eq]))',
        '',
      ].join('\n'),
    );

    const result = run('pnpm', ['exec', 'frogbot', 'run', 'src/drizzle-imports.ts'], {
      cwd: directory,
      env: { DATABASE_URL: undefined, FROGBOT_SECRET: undefined },
    });

    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain('["function","function"]');
  }, 120000);

  it.skipIf(!postgresAvailable)(
    'loads the Postgres config and generates types',
    () => {
      const directory = appDirectories.get('postgres-none')!;
      const result = run('pnpm', ['generate:types'], {
        cwd: directory,
        env: { DATABASE_URL: postgresURL() },
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

    it.each(
      cases.flatMap((appCase) =>
        ['turbopack', 'webpack'].map((bundler) => ({ ...appCase, bundler })),
      ),
    )(
      'builds the complete $name application for production ($bundler)',
      (appCase) => {
        const result = run(
          'pnpm',
          ['build', ...(appCase.bundler === 'webpack' ? ['--webpack'] : [])],
          {
            cwd: appDirectories.get(appCase.name)!,
            env: databaseEnvironment(appCase),
          },
        );

        expect(result.status, result.output).toBe(0);
        expect(result.output).toContain(
          appCase.bundler === 'webpack' ? '(webpack)' : '(Turbopack)',
        );
      },
      240000,
    );

    describe('uploaded files in a production build', () => {
      const name = 'sqlite-files';
      const text = 'Standalone file read: café, 蛙.\n';
      const modelRequests: string[] = [];
      let directory: string;
      let image: Buffer;
      let provider: http.Server;
      let providerURL: string;

      beforeAll(async () => {
        directory = appDirectories.get(name)!;
        image = fs.readFileSync(path.join(repoRoot, 'test', 'uploads', 'image.png'));

        provider = http.createServer(async (request, response) => {
          let body = '';

          for await (const chunk of request) body += chunk;

          modelRequests.push(body);

          const chunk = (choice: Record<string, unknown>, usage?: Record<string, number>) =>
            `data: ${JSON.stringify({
              id: 'standalone-files',
              object: 'chat.completion.chunk',
              created: 1,
              model: 'deepseek-v4.1-flash',
              choices: [{ index: 0, ...choice }],
              ...(usage ? { usage } : {}),
            })}\n\n`;

          const usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 };

          if (!(JSON.parse(body) as { stream?: boolean }).stream) {
            response.writeHead(200, { 'content-type': 'application/json' });

            response.end(
              JSON.stringify({
                id: 'standalone-files',
                object: 'chat.completion',
                created: 1,
                model: 'deepseek-v4.1-flash',
                choices: [
                  {
                    index: 0,
                    message: { role: 'assistant', content: 'Read.' },
                    finish_reason: 'stop',
                  },
                ],
                usage,
              }),
            );

            return;
          }

          response.writeHead(200, { 'content-type': 'text/event-stream' });
          response.write(chunk({ delta: { role: 'assistant', content: 'Read.' } }));
          response.write(chunk({ delta: {}, finish_reason: 'stop' }, usage));
          response.end('data: [DONE]\n\n');
        });

        await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve));
        providerURL = `http://127.0.0.1:${(provider.address() as net.AddressInfo).port}/v1`;

        const configPath = path.join(directory, 'src', 'frogbot.config.ts');

        fs.writeFileSync(
          configPath,
          fs
            .readFileSync(configPath, 'utf8')
            .replace(
              "baseUrl: 'https://opencode.ai/zen/v1'",
              "baseUrl: process.env.MODEL_URL || 'https://opencode.ai/zen/v1'",
            ),
        );

        for (const args of [
          ['install', '--store-dir', path.join(root, 'store')],
          ['generate:types'],
          ['migrate:create', 'init'],
          ['migrate'],
        ]) {
          runSetup('pnpm', args, { cwd: directory });
        }
      }, 300000);

      afterAll(async () => {
        await new Promise((resolve) => provider?.close(resolve));
      });

      async function expectUploadsRead(base: string, label: string, output: () => string) {
        const credentials = { email: 'owner@files.test', password: 'standalone-files' };
        const json = { 'content-type': 'application/json' };

        await fetch(`${base}/api/users/first-register`, {
          method: 'POST',
          headers: json,
          body: JSON.stringify(credentials),
        });

        const login = await fetch(`${base}/api/users/login`, {
          method: 'POST',
          headers: json,
          body: JSON.stringify(credentials),
        });

        expect(login.status, output()).toBe(200);

        const auth = {
          authorization: `Bearer ${((await login.json()) as { token: string }).token}`,
        };

        for (const slug of ['files', 'frogbot-chat-assets']) {
          for (const [filename, mediaType, data] of [
            ['upload.png', 'image/png', image],
            ['upload.txt', 'text/plain', Buffer.from(text)],
          ] as const) {
            const body = new FormData();

            body.set('_payload', '{}');
            body.set('file', new Blob([new Uint8Array(data)], { type: mediaType }), filename);

            const uploaded = await fetch(`${base}/api/${slug}`, {
              method: 'POST',
              headers: auth,
              body,
            });

            const { doc } = (await uploaded.json()) as {
              doc: { id: number; filename: string; url: string };
            };

            expect(uploaded.status, output()).toBe(201);

            const read = await fetch(new URL(doc.url, base), { headers: auth });

            expect(read.status, output()).toBe(200);
            expect(Buffer.from(await read.arrayBuffer()).equals(data)).toBe(true);

            if (slug !== 'frogbot-chat-assets') continue;

            modelRequests.length = 0;

            const answered = await fetch(`${base}/api/agents/assistant`, {
              method: 'POST',
              headers: { ...auth, ...json, accept: 'application/json' },
              body: JSON.stringify({
                messages: [
                  {
                    id: `${label}-${filename}`,
                    role: 'user',
                    parts: [
                      { type: 'text', text: 'Read the attachment.' },
                      { type: 'file-reference', id: doc.id, filename: doc.filename, mediaType },
                    ],
                  },
                ],
              }),
            });

            expect(answered.status, output()).toBe(200);
            expect(modelRequests.join('\n')).toContain(
              mediaType === 'text/plain'
                ? JSON.stringify(text).slice(1, -1)
                : data.toString('base64'),
            );
          }
        }
      }

      async function withServer(
        command: string,
        args: string[],
        cwd: string,
        use: (base: string, output: () => string) => Promise<void>,
      ) {
        const port = await getFreePort();
        const base = `http://127.0.0.1:${port}`;
        const child = spawnServer(command, args, {
          cwd,
          env: subprocessEnvironment(cwd, {
            HOSTNAME: '127.0.0.1',
            MODEL_URL: providerURL,
            NODE_ENV: 'production',
            OPENCODE_API_KEY: 'standalone-files',
            PORT: String(port),
          }),
        });

        let output = '';

        for (const stream of [child.stdout, child.stderr]) {
          stream?.on('data', (chunk: Buffer) => {
            output += chunk.toString();
          });
        }

        try {
          await waitForServer(
            child,
            async () =>
              (
                await fetch(`${base}/api/users/me`, { signal: AbortSignal.timeout(10000) }).catch(
                  () => undefined,
                )
              )?.status === 200,
            { name: 'Built app', timeout: 90000, interval: 500, output: () => output },
          );

          await use(base, () => output);
        } finally {
          await terminateProcess(child);
        }
      }

      it.each(['turbopack', 'webpack'])(
        'reads uploads through the file endpoint and an agent attachment after pnpm start (%s)',
        async (bundler) => {
          const built = run('pnpm', ['build', ...(bundler === 'webpack' ? ['--webpack'] : [])], {
            cwd: directory,
          });

          expect(built.status, built.output).toBe(0);

          await withServer('pnpm', ['start'], directory, (base, output) =>
            expectUploadsRead(base, `start-${bundler}`, output),
          );
        },
        600000,
      );

      it.each(['turbopack', 'webpack'])(
        'reads uploads through the file endpoint and an agent attachment in a moved standalone build (%s)',
        async (bundler) => {
          const built = run('pnpm', ['build', ...(bundler === 'webpack' ? ['--webpack'] : [])], {
            cwd: directory,
            env: { NEXT_OUTPUT: 'standalone' },
          });

          expect(built.status, built.output).toBe(0);

          const server = path.join(root, `standalone-${bundler}`);

          fs.cpSync(path.join(directory, '.next', 'standalone'), server, {
            recursive: true,
            verbatimSymlinks: true,
          });

          fs.cpSync(path.join(directory, '.next', 'static'), path.join(server, '.next', 'static'), {
            recursive: true,
          });

          for (const file of fs.readdirSync(directory).filter((f) => f.startsWith('frogbot.db'))) {
            fs.copyFileSync(path.join(directory, file), path.join(server, file));
          }

          const installed = path.join(directory, 'node_modules');
          const hidden = `${installed}.hidden`;

          fs.renameSync(installed, hidden);
          onTestFinished(() => fs.renameSync(hidden, installed));

          await withServer(
            process.execPath,
            [path.join(server, 'server.js')],
            server,
            (base, output) => expectUploadsRead(base, `standalone-${bundler}`, output),
          );
        },
        600000,
      );
    });
  });

  it.each(['sqlite-zen', 'sqlite-none'])(
    'boots the generated %s application',
    async (name) => {
      await expectAppBoots(appDirectories.get(name)!);
    },
    120000,
  );

  it.skipIf(!postgresAvailable)(
    'boots the generated Postgres application',
    async () => {
      await expectAppBoots(appDirectories.get('postgres-none')!, postgresURL());
    },
    120000,
  );

  it.skipIf(!mongodbAvailable)(
    'boots the generated MongoDB application',
    async () => {
      await expectAppBoots(
        appDirectories.get('mongodb-none')!,
        'mongodb://127.0.0.1:27018/frogbot-test?directConnection=true&replicaSet=rs0',
      );
    },
    120000,
  );
});

describe.skipIf(!RUN_E2E)('create-frogbot-app CLI', () => {
  let root: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'create-frogbot-app-cli-e2e-'));
  });

  afterAll(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it.each(['frog.test-app', `frog.${'long-project-'.repeat(12)}`])(
    'writes a safe MongoDB URL without changing project name %s',
    (name) => {
      const result = run(
        process.execPath,
        [cli, name, '--yes', '--no-git', '--no-install', '--db', 'mongodb', '--ai', 'none'],
        { cwd: root },
      );

      expect(result.status, result.output).toBe(0);

      const directory = path.join(root, name);
      const env = fs.readFileSync(path.join(directory, '.env'), 'utf8');
      const example = fs.readFileSync(path.join(directory, '.env.example'), 'utf8');
      const databaseLine = env.split('\n').find((line) => line.startsWith('DATABASE_URL='))!;
      const databaseName = new URL(databaseLine.slice('DATABASE_URL='.length)).pathname.slice(1);
      const pkg = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));

      expect(databaseName).toMatch(/^[a-z0-9_-]{1,63}$/);
      expect(example).toContain(databaseLine);
      expect(pkg.name).toBe(name);
    },
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
    expect(result.output).not.toContain('install failed');
    expect(fs.existsSync(path.join(root, appName, 'package.json'))).toBe(true);
  });

  it('stops before git and keeps the scaffold when dependency installation fails', () => {
    const fakeBin = path.join(root, 'fake-bin');
    const appName = 'install-failure';

    fs.mkdirSync(fakeBin);

    const result = run(process.execPath, [cli, appName, '--yes', '--use-npm'], {
      cwd: root,
      env: { PATH: fakeBin },
    });

    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain(
      '[create-frogbot-app] error: npm install failed. Git was not initialized.',
    );
    expect(fs.existsSync(path.join(root, appName, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, appName, '.git'))).toBe(false);
  });

  it('warns without writing pointers when the bundled skill is absent', () => {
    const appName = 'missing-skill';
    const isolatedCLI = copyCLIWithoutSkill(path.dirname(cli), path.join(root, 'cli-no-skill'));

    expect(fs.existsSync(path.join(path.dirname(isolatedCLI), 'dist', 'skills'))).toBe(false);

    const result = run(
      process.execPath,
      [isolatedCLI, appName, '--yes', '--no-git', '--no-install', '--agents', 'claude'],
      { cwd: root },
    );

    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain('skill is not bundled');
    expect(fs.existsSync(path.join(root, appName, 'CLAUDE.md'))).toBe(false);
    expect(fs.existsSync(path.join(root, appName, '.claude'))).toBe(false);
    expect(
      fs.existsSync(path.join(path.dirname(cli), 'dist', 'skills', 'frogbot', 'SKILL.md')),
    ).toBe(true);
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
