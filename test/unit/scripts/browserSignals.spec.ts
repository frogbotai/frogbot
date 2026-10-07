import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const cli = path.join(repoRoot, 'node_modules', '@playwright', 'test', 'cli.js');
const playwright = pathToFileURL(
  path.join(repoRoot, 'node_modules', '@playwright', 'test', 'index.mjs'),
);

const helper = path.join(repoRoot, 'test', 'browser', '__helpers', 'stopServersOnSignal.ts');

const dirs: string[] = [];
const groups: number[] = [];

afterEach(() => {
  for (const group of groups.splice(0)) {
    try {
      process.kill(-group, 'SIGKILL');
    } catch {}
  }

  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function freePort() {
  return new Promise<number>((resolve) => {
    const server = createServer().listen(0, () => {
      const { port } = server.address() as { port: number };

      server.close(() => resolve(port));
    });
  });
}

function portOpen(port: number) {
  return new Promise<boolean>((resolve) => {
    const server = createServer()
      .once('error', () => resolve(true))
      .listen(port, () => server.close(() => resolve(false)));
  });
}

function fixture(port: number, stop: boolean) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'frogbot-signals-'));
  const server = `require('node:http').createServer((q, s) => s.end('ok')).listen(${port})`;

  dirs.push(dir);

  writeFileSync(
    path.join(dir, 'playwright.config.ts'),
    [
      stop ? `import { stopServersOnSignal } from ${JSON.stringify(helper)};` : '',
      stop ? 'stopServersOnSignal();' : '',
      'export default {',
      '  testDir: __dirname,',
      `  webServer: { command: ${JSON.stringify(`node -e "${server}"`)}, url: 'http://localhost:${port}' },`,
      '};',
    ].join('\n'),
  );

  writeFileSync(
    path.join(dir, 'wait.spec.mjs'),
    `import { test } from ${JSON.stringify(playwright.href)};\ntest('waits', async () => { await new Promise(() => {}); });\n`,
  );

  return dir;
}

async function runAndTerminate(stop: boolean) {
  const port = await freePort();
  const dir = fixture(port, stop);
  const child = spawn(
    process.execPath,
    [cli, 'test', '--config', path.join(dir, 'playwright.config.ts')],
    {
      cwd: dir,
      detached: true,
      stdio: 'ignore',
    },
  );

  const exited = new Promise((resolve) => child.once('exit', resolve));

  groups.push(child.pid!);

  await expect.poll(() => portOpen(port), { timeout: 15_000 }).toBe(true);

  process.kill(-child.pid!, 'SIGTERM');
  await exited;

  return port;
}

describe('stopServersOnSignal', () => {
  it('a SIGTERM to the Playwright run stops its web servers', async () => {
    const port = await runAndTerminate(true);

    await expect.poll(() => portOpen(port), { timeout: 5_000 }).toBe(false);
  }, 30_000);
});
