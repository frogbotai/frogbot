import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import type { AppRuntime } from '../../../../../packages/frogbot/src/bin/service/runtime.js';

vi.mock('../../../../../packages/frogbot/src/bin/service/runtime.js', async (original) => ({
  ...(await original<object>()),
  runStep: () => Promise.resolve('{"frogbot":"schema","ok":true}'),
}));

const { supervise } = await import('../../../../../packages/frogbot/src/bin/service/supervisor.js');
const { freePort } = await import('../../../../../packages/frogbot/src/bin/service/ports.js');

const children: ChildProcess[] = [];
const folders: string[] = [];
const WAIT = { timeout: 15_000, interval: 50 };

afterAll(() => {
  for (const child of children) child.kill('SIGKILL');

  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
});

function folder(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));

  folders.push(dir);

  return dir;
}

function start(_app: unknown, _slot: string, port: number): ChildProcess {
  const child = spawn(
    process.execPath,
    [
      '-e',
      `require('http').createServer((q,s)=>q.url==='/hold'||s.end('ok')).listen(${port},'127.0.0.1')`,
    ],
    { detached: true },
  );

  children.push(child);

  return child;
}

async function superviseWith(dir: string, runtime: Omit<AppRuntime, 'start'>, port?: number) {
  await supervise({
    dir,
    port: port ?? (await freePort()),
    autostart: false,
    env: { ...process.env, XDG_STATE_HOME: folder('frogbot-supervisor-state-') },
    runtime: { ...runtime, start },
  });
}

const supervisorLog = (dir: string) =>
  readFileSync(join(dir, '.frogbot', 'service.log'), 'utf8')
    .split('\n')
    .filter((line) => line.includes('[supervisor]'));

const count = (lines: string[], text: string) => lines.filter((line) => line.includes(text)).length;

describe('the supervisor on changes', { timeout: 40_000 }, () => {
  it('rebuilds when a NEXT_PUBLIC_ edit is reverted while the build that read it runs', async () => {
    const dir = folder('frogbot-supervisor-env-');
    const value = () => /NEXT_PUBLIC_NAME=(\S*)/.exec(readFileSync(join(dir, '.env'), 'utf8'))?.[1];
    const baked: Record<string, string | undefined> = {};
    let release = () => {};

    let builds = 0;

    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, '.env'), 'NEXT_PUBLIC_NAME=A\n');

    await superviseWith(dir, {
      prepare: () => Promise.resolve({}),
      async build(_app, slot) {
        builds += 1;
        baked[slot] = value();

        if (builds === 2) await new Promise<void>((resolve) => (release = resolve));
      },
    });

    writeFileSync(join(dir, '.env'), 'NEXT_PUBLIC_NAME=B\n');
    await vi.waitFor(() => expect(builds).toBe(2), WAIT);

    writeFileSync(join(dir, '.env'), 'NEXT_PUBLIC_NAME=A\n');
    await vi.waitFor(() => expect(count(supervisorLog(dir), 'changed; rebuilding')).toBe(2), WAIT);

    release();
    await vi.waitFor(() => expect(count(supervisorLog(dir), 'serving')).toBe(3), WAIT);

    const served = /serving \S*builds\/(a|b)/.exec(supervisorLog(dir).at(-1) ?? '')?.[1];

    expect(builds).toBe(3);
    expect(baked[served!]).toBe('A');
  });

  it('queues no extra build when a config edit moves typescript.outputFile', async () => {
    const dir = folder('frogbot-supervisor-types-');
    const config = join(dir, 'frogbot.config.ts');
    let builds = 0;

    mkdirSync(join(dir, 'src'));
    writeFileSync(config, "export default { typescript: { outputFile: 'src/a-types.ts' } };\n");

    await superviseWith(dir, {
      async prepare() {
        const file = join(dir, /outputFile: '([^']+)'/.exec(readFileSync(config, 'utf8'))![1]);

        writeFileSync(file, `// types ${builds}\n`);
        // eslint-disable-next-line no-restricted-syntax -- lets fs.watch report the write before prepare names the path, as a slow typegen does
        await new Promise((resolve) => setTimeout(resolve, 200));

        return { typesFile: file };
      },
      async build() {
        builds += 1;

        const began = Date.now();

        if (builds > 1) {
          await vi.waitFor(() => expect(Date.now()).toBeGreaterThan(began + 2500), WAIT);
        }
      },
    });

    writeFileSync(config, "export default { typescript: { outputFile: 'src/b-types.ts' } };\n");
    await vi.waitFor(() => expect(count(supervisorLog(dir), 'serving')).toBe(2), WAIT);

    expect(count(supervisorLog(dir), 'change seen; rebuilding')).toBe(1);
    expect(builds).toBe(2);
  });

  it('keeps a build folder while an old server still drains from it, after an .env restart', async () => {
    const dir = folder('frogbot-supervisor-drain-');
    const port = await freePort();
    const first = children.length;
    const firstAliveAtBuild: boolean[] = [];
    let builds = 0;

    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, '.env'), 'SECRET=a\n');

    await superviseWith(
      dir,
      {
        prepare: () => Promise.resolve({}),
        build() {
          builds += 1;

          if (builds === 3) {
            const server = children[first];

            firstAliveAtBuild.push(server.exitCode === null && server.signalCode === null);
          }

          return Promise.resolve();
        },
      },
      port,
    );

    const held = request({ host: '127.0.0.1', port, path: '/hold' });

    held.on('error', () => {});
    held.end();
    await vi.waitFor(() => expect(held.socket?.readyState).toBe('open'), WAIT);

    writeFileSync(join(dir, '.env'), 'SECRET=b\n');
    await vi.waitFor(() => expect(count(supervisorLog(dir), 'with the new .env')).toBe(1), WAIT);

    writeFileSync(join(dir, 'src', 'one.ts'), 'export {};\n');
    await vi.waitFor(() => expect(count(supervisorLog(dir), 'serving')).toBe(3), WAIT);

    writeFileSync(join(dir, 'src', 'two.ts'), 'export {};\n');
    await vi.waitFor(() => expect(count(supervisorLog(dir), 'building into')).toBe(3), WAIT);
    // eslint-disable-next-line no-restricted-syntax -- gives an unfixed supervisor time to start the build before the held request ends
    await new Promise((resolve) => setTimeout(resolve, 1000));
    held.destroy();

    await vi.waitFor(() => expect(builds).toBe(3), WAIT);

    expect(firstAliveAtBuild).toEqual([false]);
  });
});
