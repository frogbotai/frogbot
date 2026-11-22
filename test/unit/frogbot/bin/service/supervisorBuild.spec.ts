import type * as ChildProcessModule from 'node:child_process';
import { type ChildProcess, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import type { checkNextAdvisories } from '../../../../../packages/frogbot/src/bin/nextAdvisories.js';
import {
  type AdvisoryResult,
  createAdvisor,
} from '../../../../../packages/frogbot/src/bin/service/advisory.js';
import { createLog } from '../../../../../packages/frogbot/src/bin/service/log.js';
import {
  type AppRuntime,
  nextRuntime,
  serviceBuildEnv,
  StepError,
} from '../../../../../packages/frogbot/src/bin/service/runtime.js';

const builds = vi.hoisted(() => ({
  runs: [] as { env: NodeJS.ProcessEnv }[],
  output: '',
}));

vi.mock('node:child_process', async (original) => {
  const real = await original<typeof ChildProcessModule>();
  const { PassThrough } = await import('node:stream');

  return {
    ...real,
    spawn: ((command: string, args: string[], options: { env: NodeJS.ProcessEnv }) => {
      if (!args?.[0]?.endsWith('next/dist/bin/next') || args[1] !== 'build') {
        return real.spawn(command, args, options);
      }

      const child = Object.assign(new EventEmitter(), {
        stdout: new PassThrough(),
        stderr: new PassThrough(),
      });

      builds.runs.push({ env: options.env });

      setImmediate(() => {
        child.stdout.end(builds.output);
        child.stderr.end();
        setImmediate(() => child.emit('close', 0, null));
      });

      return child;
    }) as typeof real.spawn,
  };
});

vi.mock('../../../../../packages/frogbot/src/bin/service/runtime.js', async (original) => ({
  ...(await original<object>()),
  runStep: () => Promise.resolve('{"frogbot":"schema","ok":true}'),
}));

const { supervise } = await import('../../../../../packages/frogbot/src/bin/service/supervisor.js');
const { freePort } = await import('../../../../../packages/frogbot/src/bin/service/ports.js');
const { readRegistration } =
  await import('../../../../../packages/frogbot/src/bin/service/registration.js');

const { registrationFile, serviceId } =
  await import('../../../../../packages/frogbot/src/bin/service/paths.js');

const { statusRows } = await import('../../../../../packages/frogbot/src/bin/status.js');

const children: ChildProcess[] = [];
const folders: string[] = [];
const stops: (() => void)[] = [];
const WAIT = { timeout: 30_000, interval: 50 };

const REFUSAL = [
  'SecurityFatalError: Your version of Next.js is affected by a known security vulnerability',
  'Ask the user, then run `next upgrade --agent=security` in the background.',
].join('\n');

const ADVISORY =
  'next 16.4.2 has 7 security advisories (7 moderate); run `pnpm add next@16.4.6` (no FrogBot release needed)';

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

function start(_app: unknown, _slot: string, port: number): ChildProcess {
  const child = spawn(
    process.execPath,
    ['-e', `require('http').createServer((q,s)=>s.end('ok')).listen(${port},'127.0.0.1')`],
    { detached: true },
  );

  children.push(child);

  return child;
}

const serviceLog = (dir: string) => readFileSync(join(dir, '.frogbot', 'service.log'), 'utf8');

const supervisorLines = (dir: string) =>
  serviceLog(dir)
    .split('\n')
    .filter((line) => line.includes('[supervisor]'));

function fakeNextApp(): string {
  const dir = folder('frogbot-fake-next-');
  const bin = join(dir, 'node_modules', 'next', 'dist', 'bin');

  mkdirSync(bin, { recursive: true });
  writeFileSync(join(dir, 'node_modules', 'next', 'package.json'), '{"version":"16.4.2"}\n');
  writeFileSync(join(bin, 'next'), '');

  return dir;
}

const TYPE_ERROR = new StepError('build failed (exit 1)', 'Type error: x is not a string\n');

const vulnerable: typeof checkNextAdvisories = ({ version }) =>
  Promise.resolve({
    advisories:
      version === '16.4.2'
        ? [{ id: 1, severity: 'moderate', title: 't', url: 'u', vulnerableVersions: '<=16.4.4' }]
        : [],
    fix: '16.4.6',
    peerRange: '>=16.4.0 <17.0.0',
    version,
  });

function nextApp(version: string): { dir: string; install: (version: string) => void } {
  const dir = folder('frogbot-supervisor-next-');
  const install = (next: string) => {
    writeFileSync(
      join(dir, 'node_modules', 'next', 'package.json'),
      JSON.stringify({ version: next }),
    );

    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { next } }));
  };

  mkdirSync(join(dir, 'src'));
  mkdirSync(join(dir, 'node_modules', 'next'), { recursive: true });
  install(version);

  return { dir, install };
}

async function up(
  dir: string,
  runtime: AppRuntime,
  advise: () => Promise<AdvisoryResult | undefined>,
): Promise<string> {
  const env = { ...process.env, XDG_STATE_HOME: folder('frogbot-supervisor-state-') };
  const before = new Set(process.listeners('SIGTERM'));

  await supervise({ dir, port: await freePort(), autostart: false, env, runtime, advise });

  stops.push(
    ...(process.listeners('SIGTERM').filter((listener) => !before.has(listener)) as (() => void)[]),
  );

  return registrationFile(serviceId(dir), env);
}

describe('builds under frogbot up', { timeout: 90_000 }, () => {
  it('drop the coding-agent markers Next reads, and keep the rest', () => {
    expect(
      serviceBuildEnv({
        CLAUDECODE: '1',
        CURSOR_TRACE_ID: 'x',
        __NEXT_AGENT_UPGRADE: 'security',
        NODE_ENV: 'production',
        PATH: '/bin',
      }),
    ).toEqual({ NODE_ENV: 'production', PATH: '/bin' });
  });

  it('run next build without the agent markers, its output tagged [build:next]', async () => {
    const dir = fakeNextApp();
    const log = createLog(join(dir, '.frogbot', 'service.log'));

    builds.output = 'Creating an optimized production build\n';

    await nextRuntime.build(
      {
        dir,
        log,
        env: { ...process.env, CLAUDECODE: '1', OPENCODE_CLIENT: 'tui' },
      },
      'a',
    );

    const lines = serviceLog(dir).split('\n');
    const { env } = builds.runs.at(-1)!;

    expect(env.CLAUDECODE).toBeUndefined();
    expect(env.OPENCODE_CLIENT).toBeUndefined();
    expect(env.PATH).toBe(process.env.PATH);
    expect(env.NODE_ENV).toBe('production');
    expect(lines.some((line) => line.includes('[build:next] Creating an optimized'))).toBe(true);
    expect(lines.some((line) => line.includes('[build] '))).toBe(false);
  });

  it('keep watching after a refused first build, log the fix, and serve after the next change', async () => {
    const dir = folder('frogbot-supervisor-first-');
    const state = folder('frogbot-supervisor-state-');
    const env = { ...process.env, XDG_STATE_HOME: state };
    const boots: (Error | undefined)[] = [];
    const advise = vi.fn<() => Promise<AdvisoryResult | undefined>>(() =>
      Promise.resolve({ version: '16.4.2', line: ADVISORY }),
    );

    let builds = 0;

    mkdirSync(join(dir, 'src'));

    const runtime: AppRuntime = {
      prepare: () => Promise.resolve({}),
      build() {
        builds += 1;

        return builds === 1
          ? Promise.reject(new StepError('build failed (exit 1)', `${REFUSAL}\n`))
          : Promise.resolve();
      },
      start,
    };

    const before = new Set(process.listeners('SIGTERM'));

    await supervise({
      dir,
      port: await freePort(),
      autostart: false,
      env,
      runtime,
      advise,
      onBoot: (error) => boots.push(error),
    });

    stops.push(
      ...(process
        .listeners('SIGTERM')
        .filter((listener) => !before.has(listener)) as (() => void)[]),
    );

    const file = registrationFile(serviceId(dir), env);

    expect(boots).toHaveLength(1);
    expect(boots[0]?.message).toBe(ADVISORY);
    expect(supervisorLines(dir).filter((line) => line.endsWith(ADVISORY))).toHaveLength(1);
    expect(readRegistration(file)).toMatchObject({
      state: 'build failed',
      lastError: ADVISORY,
      advisory: ADVISORY,
      pid: process.pid,
    });
    expect(statusRows([readRegistration(file)!])[0][2]).toBe('build failed');

    writeFileSync(join(dir, 'src', 'fixed.ts'), 'export {};\n');

    await vi.waitFor(() => expect(readRegistration(file)?.state).toBe('running'), WAIT);

    expect(builds).toBe(2);
    expect(boots).toHaveLength(1);
    expect(statusRows([readRegistration(file)!])[0][2]).toBe('running');
    expect(readRegistration(file)?.lastError).toBeUndefined();
    expect(readRegistration(file)?.advisory).toBe(ADVISORY);
  });

  it('drop the advisory once next is upgraded, even when npm cannot be asked then', async () => {
    const dir = folder('frogbot-supervisor-upgraded-');
    const env = { ...process.env, XDG_STATE_HOME: folder('frogbot-supervisor-state-') };
    const installed = (version: string) =>
      writeFileSync(join(dir, 'node_modules', 'next', 'package.json'), JSON.stringify({ version }));

    const check = vi.fn<typeof checkNextAdvisories>(({ version }) =>
      Promise.resolve(
        version === '16.4.2'
          ? {
              advisories: [
                {
                  id: 1,
                  severity: 'moderate',
                  title: 't',
                  url: 'u',
                  vulnerableVersions: '<=16.4.4',
                },
              ],
              fix: '16.4.6',
              peerRange: '>=16.4.0 <17.0.0',
              version,
            }
          : undefined,
      ),
    );

    mkdirSync(join(dir, 'src'));
    mkdirSync(join(dir, 'node_modules', 'next'), { recursive: true });
    installed('16.4.2');

    const before = new Set(process.listeners('SIGTERM'));

    await supervise({
      dir,
      port: await freePort(),
      autostart: false,
      env,
      runtime: { prepare: () => Promise.resolve({}), build: () => Promise.resolve(), start },
      advise: createAdvisor({ dir, check }),
    });

    stops.push(
      ...(process
        .listeners('SIGTERM')
        .filter((listener) => !before.has(listener)) as (() => void)[]),
    );

    const file = registrationFile(serviceId(dir), env);

    await vi.waitFor(
      () => expect(readRegistration(file)?.advisory).toMatch(/^next 16\.4\.2 has 1 security/),
      WAIT,
    );

    installed('16.4.6');
    writeFileSync(join(dir, 'package.json'), '{"dependencies":{"next":"16.4.6"}}\n');

    await vi.waitFor(() => expect(check).toHaveBeenCalledTimes(2), WAIT);
    await vi.waitFor(() => expect(readRegistration(file)?.advisory).toBeUndefined(), WAIT);
  });

  it('name the patched version range when npm cannot be asked', async () => {
    const dir = folder('frogbot-supervisor-offline-');
    const state = folder('frogbot-supervisor-state-');
    const env = { ...process.env, XDG_STATE_HOME: state };
    const boots: (Error | undefined)[] = [];

    mkdirSync(join(dir, 'src'));

    const before = new Set(process.listeners('SIGTERM'));

    await supervise({
      dir,
      port: await freePort(),
      autostart: false,
      env,
      runtime: {
        prepare: () => Promise.resolve({}),
        build: () => Promise.reject(new StepError('build failed (exit 1)', REFUSAL)),
        start,
      },
      advise: () => Promise.resolve(undefined),
      onBoot: (error) => boots.push(error),
    });

    stops.push(
      ...(process
        .listeners('SIGTERM')
        .filter((listener) => !before.has(listener)) as (() => void)[]),
    );

    expect(boots[0]?.message).toMatch(
      /^Next refused to build: next has a security advisory; install a patched version inside >=16\.4\.0 <17\.0\.0/,
    );
    expect(readRegistration(registrationFile(serviceId(dir), env))?.state).toBe('build failed');
  });

  it('show the advisory when the first build fails for another reason', async () => {
    const { dir } = nextApp('16.4.2');
    const file = await up(
      dir,
      { prepare: () => Promise.resolve({}), build: () => Promise.reject(TYPE_ERROR), start },
      createAdvisor({ dir, check: vulnerable }),
    );

    expect(readRegistration(file)?.state).toBe('build failed');

    await vi.waitFor(
      () => expect(readRegistration(file)?.advisory).toMatch(/^next 16\.4\.2 has 1 security/),
      WAIT,
    );
  });

  it('drop the old advisory when next is upgraded and that build fails', async () => {
    const { dir, install } = nextApp('16.4.2');
    let count = 0;
    const file = await up(
      dir,
      {
        prepare: () => Promise.resolve({}),
        build: () => (++count === 1 ? Promise.resolve() : Promise.reject(TYPE_ERROR)),
        start,
      },
      createAdvisor({ dir, check: vulnerable }),
    );

    await vi.waitFor(() => expect(readRegistration(file)?.advisory).toMatch(/16\.4\.2/), WAIT);

    install('16.4.6');

    await vi.waitFor(() => expect(readRegistration(file)?.state).toBe('update failed'), WAIT);
    await vi.waitFor(() => expect(readRegistration(file)?.advisory).toBeUndefined(), WAIT);
  });

  it("keep the newer next's answer when a slower lookup for the old one lands after it", async () => {
    const { dir, install } = nextApp('16.4.2');
    let release = () => {};

    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });

    const check = vi.fn<typeof checkNextAdvisories>(async (props) => {
      if (props.version === '16.4.2') await slow;

      return vulnerable(props);
    });

    const advisor = createAdvisor({ dir, check });
    const answered: (string | undefined)[] = [];
    const file = await up(
      dir,
      { prepare: () => Promise.resolve({}), build: () => Promise.resolve(), start },
      () =>
        advisor().then((result) => {
          answered.push(result?.version);

          return result;
        }),
    );

    await vi.waitFor(() => expect(readRegistration(file)?.state).toBe('running'), WAIT);

    install('16.4.6');

    await vi.waitFor(() => expect(answered).toEqual(['16.4.6']), WAIT);

    release();

    await vi.waitFor(() => expect(answered).toEqual(['16.4.6', '16.4.2']), WAIT);

    expect(readRegistration(file)?.advisory).toBeUndefined();
  });
});
