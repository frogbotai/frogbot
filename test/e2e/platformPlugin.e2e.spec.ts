import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { getFreePort, spawnServer, terminateProcess, waitForServer } from './process';

const RUN_E2E = process.env.RUN_E2E === '1';
const repoRoot = resolve(import.meta.dirname, '..', '..');
const fixtureDir = join(repoRoot, 'test', 'e2e', 'fixtures', 'platform-plugin');
const buildDir = join(fixtureDir, '.next');
const require = createRequire(join(fixtureDir, 'package.json'));
const MARKER = 'fixture-platform-marker';

function fixtureEnv(platformPlugin: string | undefined): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, NEXT_OUTPUT: 'standalone' };

  delete env.NODE_PATH;
  delete env.FROGBOT_PLATFORM_PLUGIN;

  if (platformPlugin) env.FROGBOT_PLATFORM_PLUGIN = platformPlugin;

  return env;
}

function run(args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number; output: string }> {
  return new Promise((resolveExit, reject) => {
    const child = spawnServer(process.execPath, args, { cwd: fixtureDir, env });
    let output = '';

    child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolveExit({ code: code ?? 1, output }));
  });
}

function standaloneApp(): string {
  const standalone = join(buildDir, 'standalone');
  const nested = join(standalone, relative(repoRoot, fixtureDir));

  return existsSync(join(nested, 'server.js')) ? nested : standalone;
}

function serverChunksContain(dir: string, text: string): boolean {
  return readdirSync(dir, { recursive: true, withFileTypes: true }).some(
    (entry) =>
      entry.isFile() &&
      entry.name.endsWith('.js') &&
      readFileSync(join(entry.parentPath, entry.name), 'utf8').includes(text),
  );
}

async function markerFromServer(): Promise<unknown> {
  const app = standaloneApp();
  const port = await getFreePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawnServer(process.execPath, [join(app, 'server.js')], {
    cwd: app,
    env: {
      ...fixtureEnv(undefined),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
      PORT: `${port}`,
    },
  });

  let output = '';

  child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));

  try {
    let body: unknown;

    await waitForServer(
      child,
      async () => {
        const response = await fetch(`${base}/marker`).catch(() => undefined);

        if (response?.status !== 200) return false;
        body = await response.json();

        return true;
      },
      { name: 'Standalone server', timeout: 60000, interval: 500, output: () => output },
    );

    return body;
  } finally {
    await terminateProcess(child);
  }
}

function fixtureStatus(): string {
  return execFileSync('git', ['status', '--porcelain', '--', fixtureDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

describe.skipIf(!RUN_E2E)('platform plugin injection', () => {
  const next = require.resolve('next/dist/bin/next');

  afterEach(() => {
    rmSync(buildDir, { recursive: true, force: true });
  });

  it('builds the same app, without the plugin, when FROGBOT_PLATFORM_PLUGIN is unset', async () => {
    const before = fixtureStatus();
    const build = await run([next, 'build', '--webpack'], fixtureEnv(undefined));

    expect(build.code, build.output).toBe(0);
    expect(serverChunksContain(join(standaloneApp(), '.next', 'server'), MARKER)).toBe(false);
    expect(await markerFromServer()).toEqual({ marker: null });
    expect(fixtureStatus()).toBe(before);
  }, 300000);

  it.each([
    ['webpack', ['--webpack']],
    ['Turbopack', []],
  ])(
    'puts the named plugin in the %s standalone build and runs it last',
    async (_bundler, flags) => {
      const before = fixtureStatus();
      const build = await run([next, 'build', ...flags], fixtureEnv(MARKER));

      expect(build.code, build.output).toBe(0);
      expect(serverChunksContain(join(standaloneApp(), '.next', 'server'), MARKER)).toBe(true);
      expect(await markerFromServer()).toEqual({ marker: MARKER });
      expect(fixtureStatus()).toBe(before);
    },
    300000,
  );

  it('loads the named plugin in the frogbot CLI', async () => {
    const frogbot = join(repoRoot, 'packages', 'frogbot');
    const script = `
      const { tsImport } = await import(${JSON.stringify(createRequire(join(frogbot, 'package.json')).resolve('tsx/esm/api'))});
      const { loadConfig } = await tsImport(${JSON.stringify(join(frogbot, 'dist', 'config', 'load.js'))}, import.meta.url);
      const config = await loadConfig({ cwd: process.cwd() });
      const { custom } = await config._internal.payloadConfig;
      console.log(JSON.stringify({ marker: custom?.platformMarker ?? null }));
    `;

    const unset = await run(['--input-type=module', '-e', script], fixtureEnv(undefined));
    const set = await run(['--input-type=module', '-e', script], fixtureEnv(MARKER));

    expect(unset.code, unset.output).toBe(0);
    expect(unset.output).toContain('{"marker":null}');
    expect(set.code, set.output).toBe(0);
    expect(set.output).toContain(`{"marker":"${MARKER}"}`);
  }, 120000);
});
