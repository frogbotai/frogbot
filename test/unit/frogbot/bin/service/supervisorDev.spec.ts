import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import type { App } from '../../../../../packages/frogbot/src/bin/service/runtime.js';

vi.mock('../../../../../packages/frogbot/src/bin/service/runtime.js', async (original) => ({
  ...(await original<object>()),
  runStep: () => Promise.resolve('{"frogbot":"schema","ok":true}'),
}));

const { supervise, SETTINGS_SIGNAL } =
  await import('../../../../../packages/frogbot/src/bin/service/supervisor.js');

const { freePort } = await import('../../../../../packages/frogbot/src/bin/service/ports.js');
const { readRegistration } =
  await import('../../../../../packages/frogbot/src/bin/service/registration.js');

const { registrationFile, serviceId } =
  await import('../../../../../packages/frogbot/src/bin/service/paths.js');

const children: ChildProcess[] = [];
const folders: string[] = [];
const stops: (() => void)[] = [];
const WAIT = { timeout: 30_000, interval: 50 };

afterAll(async () => {
  const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

  try {
    for (const stop of stops) stop();

    await vi.waitFor(() => {
      if (exit.mock.calls.length < stops.length) throw new Error('supervisors still stopping');
    }, WAIT);
  } finally {
    exit.mockRestore();
  }

  for (const child of children) child.kill('SIGKILL');

  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
}, 60_000);

function folder(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));

  folders.push(dir);

  return dir;
}

const DEV_SERVER = `
const fs = require('fs');
const lock = '.next/dev/lock';
if (fs.existsSync('broken-start')) process.exit(1);
try {
  process.kill(Number(fs.readFileSync(lock, 'utf8')), 0);
  console.error('Another next dev server is already running');
  process.exit(1);
} catch {}
fs.mkdirSync('.next/dev', { recursive: true });
fs.writeFileSync(lock, String(process.pid));
process.on('SIGTERM', () => { fs.rmSync(lock, { force: true }); process.exit(0); });
require('http').createServer((q, s) => s.end('dev ' + process.pid))
  .on('upgrade', (q, socket) => socket.write('HTTP/1.1 101 Switching Protocols\\r\\nUpgrade: websocket\\r\\nConnection: Upgrade\\r\\n\\r\\n'))
  .listen(Number(process.argv[1]), '127.0.0.1');
`;

const PROD_SERVER = `require('http').createServer((q, s) => s.end('prod ' + process.pid)).listen(Number(process.argv[1]), '127.0.0.1')`;

function server(script: string, dir: string, port: number): ChildProcess {
  const child = spawn(process.execPath, ['-e', script, String(port)], { cwd: dir, detached: true });

  children.push(child);

  return child;
}

type Calls = { prepare: number; build: number; devStarts: number };

async function superviseDev(
  dir: string,
  {
    mode = 'dev' as const,
    prepare = () => {},
    build = () => Promise.resolve(),
  }: {
    mode?: 'dev' | 'production';
    prepare?: () => void;
    build?: (call: number) => Promise<void>;
  } = {},
) {
  const before = new Set(process.listeners('SIGTERM'));
  const port = await freePort();
  const env = { ...process.env, XDG_STATE_HOME: folder('frogbot-supervisor-dev-state-') };
  const calls: Calls = { prepare: 0, build: 0, devStarts: 0 };

  await supervise({
    dir,
    port,
    autostart: false,
    env,
    mode,
    runtimes: {
      production: {
        prepare: () => Promise.resolve({}),
        build: () => {
          calls.build += 1;

          return build(calls.build);
        },
        start: (app: App, _slot, serverPort) => server(PROD_SERVER, app.dir, serverPort),
      },
      dev: {
        prepare: () => {
          calls.prepare += 1;
          prepare();

          return Promise.resolve({});
        },
        start: (app: App, _slot, serverPort) => {
          calls.devStarts += 1;

          return server(DEV_SERVER, app.dir, serverPort);
        },
      },
    },
  });

  stops.push(
    ...(process.listeners('SIGTERM').filter((listener) => !before.has(listener)) as (() => void)[]),
  );

  const registration = () => readRegistration(registrationFile(serviceId(dir), env))!;
  const get = async () => (await fetch(`http://127.0.0.1:${port}/`)).text();

  return { calls, registration, get, port };
}

function requestMode(dir: string, mode: 'dev' | 'production') {
  writeFileSync(join(dir, '.frogbot', 'mode-request'), `${mode}\n`);
  process.emit(SETTINGS_SIGNAL, SETTINGS_SIGNAL);
}

function app(prefix: string): string {
  const dir = folder(prefix);

  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'frogbot.config.ts'), 'export default {};\n');

  return dir;
}

const supervisorLog = (dir: string) =>
  readFileSync(join(dir, '.frogbot', 'service.log'), 'utf8')
    .split('\n')
    .filter((line) => line.includes('[supervisor]'));

const alive = (pid: number | undefined) => {
  try {
    process.kill(pid!, 0);

    return true;
  } catch {
    return false;
  }
};

describe('the supervisor in dev mode', { timeout: 90_000 }, () => {
  it('leaves src/ edits to hot reload and runs no build', async () => {
    const dir = app('frogbot-dev-src-');
    const { calls, registration, get } = await superviseDev(dir);

    expect(registration()).toMatchObject({ state: 'running', mode: 'dev' });
    expect(registration().build).toBeUndefined();
    expect(await get()).toMatch(/^dev /);

    writeFileSync(join(dir, 'src', 'page.tsx'), 'export default () => null;\n');
    mkdirSync(join(dir, 'public'), { recursive: true });
    writeFileSync(join(dir, 'public', 'logo.svg'), '<svg/>\n');
    // eslint-disable-next-line no-restricted-syntax -- waits past the watcher's 1.5 s debounce, which would start a restart
    await new Promise((resolve) => setTimeout(resolve, 2500));

    expect(calls).toEqual({ prepare: 1, build: 0, devStarts: 1 });
    expect(supervisorLog(dir).filter((line) => line.includes('changed'))).toEqual([]);
  });

  it('restarts on a config edit: prepare, stop the old server, then start the new one', async () => {
    const dir = app('frogbot-dev-config-');
    const { calls, registration, get } = await superviseDev(dir);
    const first = registration().serverPid;

    writeFileSync(join(dir, 'frogbot.config.ts'), 'export default { serverURL: "x" };\n');

    await vi.waitFor(() => {
      expect(registration()).toMatchObject({ state: 'running' });
      expect(registration().serverPid).not.toBe(first);
    }, WAIT);

    expect(await get()).toBe(`dev ${registration().serverPid}`);
    expect(alive(first)).toBe(false);
    expect(calls).toEqual({ prepare: 2, build: 0, devStarts: 2 });
    expect(supervisorLog(dir).some((line) => line.includes('restarting in'))).toBe(false);
    expect(registration().lastError).toBeUndefined();
  });

  it('keeps the old server when the config fails to load', async () => {
    const dir = app('frogbot-dev-broken-config-');
    let broken = false;
    const { calls, registration, get } = await superviseDev(dir, {
      prepare: () => {
        if (broken) throw new Error('generate:importmap failed (exit 1)');
      },
    });

    const first = registration().serverPid;

    broken = true;
    writeFileSync(join(dir, 'frogbot.config.ts'), 'export default {;\n');

    await vi.waitFor(() => expect(registration().state).toBe('update failed'), WAIT);

    expect(registration()).toMatchObject({
      serverPid: first,
      lastError: 'generate:importmap failed (exit 1)',
    });
    expect(await get()).toBe(`dev ${first}`);
    expect(calls.devStarts).toBe(1);
  });

  it('answers 503 after a start that fails, shows `update failed`, and retries on the next change', async () => {
    const dir = app('frogbot-dev-broken-start-');
    const { registration, get } = await superviseDev(dir);

    writeFileSync(join(dir, 'broken-start'), '');
    writeFileSync(join(dir, '.env'), 'A=1\n');

    await vi.waitFor(() => expect(registration().state).toBe('update failed'), WAIT);

    expect(registration().lastError).toMatch(/server exited/);
    expect(registration().serverPid).toBeUndefined();

    const gap = await fetch(`http://127.0.0.1:${registration().port}/`);

    expect([gap.status, gap.headers.get('retry-after')]).toEqual([503, '1']);

    await gap.body?.cancel();

    rmSync(join(dir, 'broken-start'));
    writeFileSync(join(dir, '.env'), 'A=2\n');

    await vi.waitFor(() => expect(registration().state).toBe('running'), WAIT);

    expect(await get()).toBe(`dev ${registration().serverPid}`);
  });

  it('restarts a crashed dev server', async () => {
    const dir = app('frogbot-dev-crash-');
    const { registration, get } = await superviseDev(dir);
    const first = registration().serverPid!;

    process.kill(-first, 'SIGKILL');

    await vi.waitFor(() => {
      expect(registration().state).toBe('running');
      expect(registration().serverPid).not.toBe(first);
    }, WAIT);

    expect(await get()).toBe(`dev ${registration().serverPid}`);
  });

  it('switches a running production app to dev and back on the settings signal', async () => {
    const dir = app('frogbot-dev-switch-');
    const { calls, registration, get } = await superviseDev(dir, { mode: 'production' });
    const prod = registration().serverPid;

    expect(registration()).toMatchObject({ mode: 'production', build: 'a' });

    writeFileSync(join(dir, '.frogbot', 'mode-request'), 'dev\n');
    process.emit(SETTINGS_SIGNAL, SETTINGS_SIGNAL);

    expect(registration().switching).toBe('dev');

    await vi.waitFor(() => {
      expect(registration()).toMatchObject({ mode: 'dev', state: 'running' });
      expect(registration().switching).toBeUndefined();
    }, WAIT);

    expect(await get()).toBe(`dev ${registration().serverPid}`);

    await vi.waitFor(() => expect(alive(prod)).toBe(false), WAIT);

    writeFileSync(join(dir, '.frogbot', 'mode-request'), 'production\n');
    process.emit(SETTINGS_SIGNAL, SETTINGS_SIGNAL);

    await vi.waitFor(() => {
      expect(registration()).toMatchObject({ mode: 'production', state: 'running', build: 'b' });
      expect(registration().switching).toBeUndefined();
    }, WAIT);

    expect(await get()).toMatch(/^prod /);
    expect(calls.build).toBe(2);
  });

  it('switches to dev once the first build lands when the switch comes during it, with one dev server', async () => {
    const dir = app('frogbot-dev-boot-switch-');
    let first = true;
    const { calls, registration, get } = await superviseDev(dir, {
      mode: 'production',
      async build() {
        if (!first) return;
        first = false;
        writeFileSync(join(dir, '.frogbot', 'mode-request'), 'dev\n');
        process.emit(SETTINGS_SIGNAL, SETTINGS_SIGNAL);

        await vi.waitFor(
          () => expect(supervisorLog(dir).join('\n')).toContain('switching to dev'),
          WAIT,
        );
      },
    });

    await vi.waitFor(() => {
      expect(registration()).toMatchObject({ mode: 'dev', state: 'running' });
      expect(registration().switching).toBeUndefined();
    }, WAIT);

    expect(await get()).toBe(`dev ${registration().serverPid}`);
    expect(calls.devStarts).toBe(1);
    expect(supervisorLog(dir).filter((line) => line.includes('failed'))).toEqual([]);
  });

  it('drops a switch to dev that a switch back cancels during the first build, building once', async () => {
    const dir = app('frogbot-dev-boot-cancel-');
    let first = true;
    const request = (mode: string) => {
      writeFileSync(join(dir, '.frogbot', 'mode-request'), `${mode}\n`);
      process.emit(SETTINGS_SIGNAL, SETTINGS_SIGNAL);
    };

    const { calls, registration } = await superviseDev(dir, {
      mode: 'production',
      build() {
        if (first) {
          first = false;
          request('dev');
          request('production');
        }

        return Promise.resolve();
      },
    });

    expect(registration()).toMatchObject({ mode: 'production', state: 'running' });
    expect(registration().switching).toBeUndefined();
    expect(calls).toEqual({ prepare: 0, build: 1, devStarts: 0 });
  });

  it('switches dev → production → dev while an open hot reload socket holds the old dev server', async () => {
    const dir = app('frogbot-dev-redev-');
    const { registration, port, get } = await superviseDev(dir);
    const socket = connect({ host: '127.0.0.1', port });
    let received = '';

    socket.on('data', (chunk: Buffer) => (received += String(chunk)));

    socket.write(
      'GET /_next/webpack-hmr HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n',
    );

    await expect.poll(() => received).toContain('101 Switching Protocols');

    requestMode(dir, 'production');

    await vi.waitFor(() => {
      expect(registration()).toMatchObject({ mode: 'production', state: 'running' });
      expect(registration().switching).toBeUndefined();
    }, WAIT);

    requestMode(dir, 'dev');

    await vi.waitFor(() => {
      expect(registration().mode).toBe('dev');
      expect(registration().switching).toBeUndefined();
    }, WAIT);

    socket.destroy();

    expect(registration().state).toBe('running');
    expect(registration().lastError).toBeUndefined();
    expect(await get()).toBe(`dev ${registration().serverPid}`);
  });

  it('still shows `update failed`, not `crashed`, when the next start fails too', async () => {
    const dir = app('frogbot-dev-failed-twice-');
    const { registration } = await superviseDev(dir);
    const failures = () => supervisorLog(dir).filter((line) => line.includes('update failed'));

    writeFileSync(join(dir, 'broken-start'), '');
    writeFileSync(join(dir, '.env'), 'A=1\n');

    await vi.waitFor(() => expect(failures()).toHaveLength(1), WAIT);

    writeFileSync(join(dir, '.env'), 'A=2\n');

    await vi.waitFor(() => expect(failures()).toHaveLength(2), WAIT);

    expect(registration().state).toBe('update failed');
  });

  it('runs no extra build when a bare `up` cancels a switch to dev sent during a build', async () => {
    const dir = app('frogbot-dev-cancel-build-');
    let release = () => {};

    const { calls, registration } = await superviseDev(dir, {
      mode: 'production',
      build: (call) =>
        call === 2 ? new Promise<void>((resolve) => (release = resolve)) : Promise.resolve(),
    });

    writeFileSync(join(dir, 'src', 'page.tsx'), 'export default () => null;\n');

    await vi.waitFor(() => expect(calls.build).toBe(2), WAIT);

    const firstBuilt = registration().builtAt;

    requestMode(dir, 'dev');
    requestMode(dir, 'production');
    release();

    await vi.waitFor(() => expect(registration().builtAt).not.toBe(firstBuilt), WAIT);
    // eslint-disable-next-line no-restricted-syntax -- waits past the point a queued update would start its build
    await new Promise((resolve) => setTimeout(resolve, 2000));

    expect(registration()).toMatchObject({ state: 'running', mode: 'production' });
    expect(calls).toMatchObject({ build: 2, devStarts: 0 });
  });
});
