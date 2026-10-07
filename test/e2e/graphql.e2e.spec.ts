import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { formatNames } from 'payload';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CHAT_TURNS_SLUG } from '../../packages/frogbot/src/chat/collections/turns.js';
import {
  applyLocalOverrides,
  packLocalClosure,
  run,
  runSetup,
  subprocessEnvironment,
} from './create-frogbot-app/harness';
import { getFreePort, spawnServer, terminateProcess, waitForServer } from './process';

const RUN_E2E = process.env.RUN_E2E === '1';
const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const cli = path.join(repoRoot, 'packages', 'create-frogbot-app', 'bin.js');
const docsDirectory = path.join(repoRoot, 'docs', 'graphql');
const graphQLPackage = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'packages', 'graphql', 'package.json'), 'utf8'),
) as { version: string };

type DocsFence = { code: string; file: string; title?: string };

function tsFences(file: string): DocsFence[] {
  const source = fs.readFileSync(path.join(docsDirectory, file), 'utf8');
  const fences = source.matchAll(/^```ts(?: title="([^"]+)")?\n([\s\S]*?)^```$/gm);

  return [...fences].map(([, title, code]) => ({ code, file, title }));
}

const routeFiles = tsFences('enable.mdx').filter(({ title }) => title?.startsWith('src/app/'));
const docsExamples = fs
  .readdirSync(docsDirectory)
  .filter((file) => file.endsWith('.mdx'))
  .flatMap(tsFences)
  .filter((fence) => !routeFiles.includes(fence));

type Server = { baseURL: string; child: ChildProcess };

describe.skipIf(!RUN_E2E)('GraphQL in a scaffolded application', () => {
  let root: string;
  let app: string;
  let server: Server | undefined;
  let token: string;

  async function startServer(command: 'dev' | 'start'): Promise<Server> {
    const port = await getFreePort();
    const baseURL = `http://127.0.0.1:${port}`;
    const child = spawnServer(
      process.execPath,
      [path.join(app, 'node_modules', 'next', 'dist', 'bin', 'next'), command, '--port', `${port}`],
      { cwd: app, env: subprocessEnvironment(app), stdout: 'ignore' },
    );

    let errors = '';

    child.stderr?.on('data', (chunk: Buffer) => {
      errors += chunk.toString();
    });

    await waitForServer(
      child,
      async () => (await fetch(`${baseURL}/api/users/me`).catch(() => undefined))?.status === 200,
      { name: `next ${command}`, timeout: 180000, interval: 500, output: () => errors },
    );

    return { baseURL, child };
  }

  async function restart(command: 'dev' | 'start'): Promise<Server> {
    await terminateProcess(server?.child);

    server = await startServer(command);

    return server;
  }

  async function graphQL(baseURL: string, query: string, authToken?: string) {
    const headers = new Headers({ 'content-type': 'application/json' });

    if (authToken) headers.set('authorization', `JWT ${authToken}`);

    return fetch(`${baseURL}/api/graphql`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query }),
    });
  }

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'frogbot-graphql-e2e-'));
    app = path.join(root, 'graphql-app');

    runSetup(
      process.execPath,
      [cli, 'graphql-app', '--yes', '--no-git', '--no-install', '--db', 'sqlite', '--ai', 'none'],
      { cwd: root },
    );

    const packagePath = path.join(app, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as {
      devDependencies: Record<string, string>;
    };

    pkg.devDependencies['@frogbotai/graphql'] = `^${graphQLPackage.version}`;
    fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

    const packages = packLocalClosure({
      appDirectories: [app],
      outputDirectory: path.join(root, 'packages'),
      repoRoot,
    });

    if (!packages.some(({ name }) => name === '@frogbotai/graphql')) {
      throw new Error('The local package closure is missing @frogbotai/graphql');
    }

    applyLocalOverrides(app, packages);

    runSetup('pnpm', ['install', '--store-dir', path.join(root, 'store')], { cwd: app });
  }, 300000);

  afterAll(async () => {
    await terminateProcess(server?.child);

    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it('ships the scaffold without GraphQL routes', async () => {
    const { baseURL } = await restart('dev');

    const response = await graphQL(baseURL, '{ Users { totalDocs } }');

    expect(fs.existsSync(path.join(app, 'src', 'app', '(frogbot)', 'api', 'graphql'))).toBe(false);
    expect(response.status).toBe(404);
  }, 240000);

  it('serves GraphQL and the playground after adding the documented route files', async () => {
    expect(routeFiles.map(({ title }) => title)).toEqual([
      'src/app/(frogbot)/api/graphql/route.ts',
      'src/app/(frogbot)/api/graphql-playground/route.ts',
    ]);

    for (const { code, title } of routeFiles) {
      const file = path.join(app, title!);

      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, code);
    }

    const { baseURL } = await restart('dev');

    const registration = await fetch(`${baseURL}/api/users/first-register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'graphql@frogbot.test', password: 'frogbot-e2e-password' }),
    });
    const registered = (await registration.json()) as { token: string };

    token = registered.token;

    const response = await graphQL(baseURL, '{ Users { totalDocs } }', token);
    const body = await response.json();
    const playground = await fetch(`${baseURL}/api/graphql-playground`);

    expect(registration.status, JSON.stringify(registered)).toBe(200);
    expect(response.status).toBe(200);
    expect(body).toEqual({ data: { Users: { totalDocs: 1 } } });
    expect(playground.status).toBe(200);
    expect(playground.headers.get('content-type')).toContain('text/html');
  }, 240000);

  it('generates the schema with the frogbot-graphql bin', async () => {
    await terminateProcess(server?.child);

    const result = run('pnpm', ['frogbot-graphql', 'generate:schema'], { cwd: app });

    const sdl = fs.readFileSync(path.join(app, 'schema.graphql'), 'utf8');

    expect(result.status, result.output).toBe(0);
    expect(sdl).toContain('type User {');
    expect(sdl).not.toContain(formatNames(CHAT_TURNS_SLUG).singular);
    expect(sdl).not.toContain('PayloadPreference');
  }, 120000);

  it('typechecks every GraphQL docs example', () => {
    const examples = path.join(app, 'src', 'docs-examples');

    fs.mkdirSync(examples);

    docsExamples.forEach(({ code, file }, index) => {
      fs.writeFileSync(path.join(examples, `${path.basename(file, '.mdx')}-${index}.ts`), code);
    });

    const result = run('pnpm', ['typecheck'], { cwd: app });

    fs.rmSync(examples, { recursive: true, force: true });

    expect(docsExamples.length).toBeGreaterThan(0);
    expect(result.status, result.output).toBe(0);
  }, 180000);

  it('hides the playground and keeps GraphQL answering in production', async () => {
    const build = run('pnpm', ['build'], { cwd: app });

    expect(build.status, build.output).toBe(0);

    const { baseURL } = await restart('start');

    const playground = await fetch(`${baseURL}/api/graphql-playground`);
    const response = await graphQL(baseURL, '{ Users { totalDocs } }', token);

    expect(playground.status).toBe(404);
    expect(await response.json()).toEqual({ data: { Users: { totalDocs: 1 } } });
  }, 480000);

  it('keeps the template free of framework branding', () => {
    const result = run(process.execPath, [path.join(repoRoot, 'scripts', 'check-branding.mjs')], {
      cwd: repoRoot,
    });

    expect(result.status, result.output).toBe(0);
  });
});
