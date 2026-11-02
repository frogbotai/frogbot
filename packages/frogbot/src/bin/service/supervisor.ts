import type { ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

import { FROGBOT_VERSION } from '../../version.js';
import { createBackoff } from './backoff.js';
import { createLog, type Log } from './log.js';
import { appPaths, registrationFile, serviceId, type Slot } from './paths.js';
import { freePort, HOST } from './ports.js';
import { createProxy, drained, type Upstream } from './proxy.js';
import { createBuildQueue } from './queue.js';
import {
  type Registration,
  removeRegistration,
  watchOwnership,
  writeRegistration,
} from './registration.js';
import {
  type App,
  type AppRuntime,
  frogbotBin,
  nextRuntime,
  runStep,
  StepError,
} from './runtime.js';
import { watchApp } from './watch.js';

/** The marker `frogbot up` looks for in a LaunchAgent's log when the first build fails. */
export const BOOT_FAILED = '[frogbot] up failed:';

const DRAIN_MS = 30_000;
const HEALTH_MS = 60_000;
const ERROR_TAIL_LINES = 30;

type Server = {
  slot: Slot;
  port: number;
  child: ChildProcess;
  startedAt: number;
  upstream?: Upstream;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const tail = (text: string) => text.trimEnd().split('\n').slice(-ERROR_TAIL_LINES).join('\n');

function exited(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();

  return new Promise((resolve) => child.once('exit', () => resolve()));
}

function signalGroup(child: ChildProcess, signal: NodeJS.Signals) {
  try {
    process.kill(-child.pid!, signal);
  } catch {
    child.kill(signal);
  }
}

async function stopServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;

  signalGroup(child, 'SIGTERM');

  const timer = setTimeout(() => signalGroup(child, 'SIGKILL'), 5000);

  await exited(child);
  clearTimeout(timer);
}

async function healthy(port: number, child: ChildProcess, timeout = HEALTH_MS): Promise<void> {
  const deadline = Date.now() + timeout;
  let gone = false;

  void exited(child).then(() => (gone = true));

  for (const path of ['/', '/admin']) {
    for (;;) {
      if (gone) {
        throw new Error(`the server exited (${child.signalCode ?? `exit ${child.exitCode}`})`);
      }

      if (Date.now() > deadline) {
        throw new Error(`the server didn't answer ${path} within ${timeout / 1000} s`);
      }

      const status = await fetch(`http://${HOST}:${port}${path}`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      }).then(
        async (response) => {
          await response.body?.cancel();

          return response.status;
        },
        () => undefined,
      );

      if (status !== undefined && status < 500) break;
      if (status !== undefined) throw new Error(`the server answered ${path} with ${status}`);

      await sleep(200);
    }
  }
}

type SchemaLine = { frogbot: 'schema'; ok: boolean; applied: number; error?: string };

async function syncSchema(app: App): Promise<void> {
  let output: string;

  try {
    output = await runStep(app, 'schema', [frogbotBin, 'up'], {
      ...app.env,
      NODE_ENV: 'production',
      FROGBOT_SERVICE: 'schema',
    });
  } catch (error) {
    const line = error instanceof StepError ? parseSchemaLine(error.output) : undefined;

    if (line?.error) {
      throw new StepError(
        `schema sync refused: ${line.error}`,
        error instanceof StepError ? error.output : '',
      );
    }

    throw error;
  }

  const line = parseSchemaLine(output);

  if (!line) throw new StepError('schema sync printed no result', output);
  if (!line.ok) throw new StepError(`schema sync refused: ${line.error}`, output);
  if (line.applied) app.log.write('supervisor', `schema sync applied ${line.applied} statements`);
}

function parseSchemaLine(output: string): SchemaLine | undefined {
  const last = output.trim().split('\n').at(-1) ?? '';

  try {
    const value = JSON.parse(last) as SchemaLine;

    return value?.frogbot === 'schema' ? value : undefined;
  } catch {
    return undefined;
  }
}

export type SuperviseOptions = {
  dir: string;
  port: number;
  autostart: boolean;
  env: NodeJS.ProcessEnv;
  runtime?: AppRuntime;
  /** Called once the app first answers, or with the error when it never does. */
  onBoot?: (error?: Error) => void;
};

/**
 * The long-lived `frogbot up` process: holds the public port, builds into the idle slot on every
 * change (one build at a time), syncs the schema, starts a server on that build and swaps the proxy to
 * it once it answers. A failed update keeps the old server; a crashed server restarts on its build.
 */
export async function supervise({
  dir,
  port,
  autostart,
  env,
  runtime = nextRuntime,
  onBoot,
}: SuperviseOptions): Promise<void> {
  const paths = appPaths(dir);
  const id = serviceId(dir);
  const file = registrationFile(id, env);
  const log: Log = createLog(paths.log);
  const app: App = { dir, env, log };
  const proxy = createProxy();
  const backoff = createBackoff();
  const draining = new Map<Slot, ChildProcess>();
  let current: Server | undefined;
  let booted = false;
  let stopping = false;

  await proxy.listen(port);
  mkdirSync(paths.root, { recursive: true });
  writeFileSync(paths.port, `${port}\n`);

  const registration: Registration = {
    id,
    dir,
    url: `http://${HOST}:${port}`,
    port,
    pid: process.pid,
    frogbot: FROGBOT_VERSION,
    startedAt: new Date().toISOString(),
    state: 'starting',
    log: paths.log,
    autostart,
  };

  const save = (changes: Partial<Registration>) => {
    if (stopping) return;
    Object.assign(registration, changes);
    writeRegistration(file, registration);
  };

  save({});

  log.write(
    'supervisor',
    `up at ${registration.url} (pid ${process.pid}, FrogBot ${FROGBOT_VERSION})`,
  );

  async function launch(slot: Slot): Promise<Server> {
    const serverPort = await freePort();
    const child = runtime.start(app, slot, serverPort);
    const server: Server = { slot, port: serverPort, child, startedAt: Date.now() };

    try {
      await healthy(serverPort, child);
    } catch (error) {
      await stopServer(child);
      throw error;
    }

    return server;
  }

  function swap(server: Server) {
    const previous = current;
    const old = proxy.switchTo(server.port);

    server.upstream = proxy.current;
    current = server;
    watchCrash(server);

    if (previous && previous.child !== server.child) {
      draining.set(previous.slot, previous.child);

      void (old ? drained(old, DRAIN_MS) : Promise.resolve())
        .then(() => stopServer(previous.child))
        .finally(() => {
          if (draining.get(previous.slot) === previous.child) draining.delete(previous.slot);
        });
    }

    save({
      state: 'running',
      build: server.slot,
      serverPid: server.child.pid,
      lastError: undefined,
    });
  }

  function watchCrash(server: Server) {
    server.child.once('exit', (code, signal) => {
      if (stopping || current !== server) return;

      const reason = `server exited (${signal ?? `exit ${code}`})`;

      signalGroup(server.child, 'SIGKILL');
      save({ state: 'crashed', serverPid: undefined, lastError: reason });
      restart(server, server.startedAt, reason);
    });
  }

  function restart(server: Server, upSince: number, reason: string) {
    const wait = backoff.next(upSince);

    log.write('supervisor', `${reason}; restarting in ${wait / 1000} s`);

    setTimeout(() => {
      if (stopping || current !== server) return;

      launch(server.slot).then(
        (next) => {
          if (!stopping && current === server) swap(next);
          else void stopServer(next.child);
        },
        (error: unknown) => {
          if (stopping || current !== server) return;

          const message = `restart failed: ${error instanceof Error ? error.message : String(error)}`;

          save({ lastError: message });
          restart(server, Date.now(), message);
        },
      );
    }, wait).unref();
  }

  async function update(): Promise<void> {
    const slot: Slot = current?.slot === 'a' ? 'b' : 'a';

    save({ state: booted ? 'building' : 'starting' });
    log.write('supervisor', `building into ${paths.distDir(slot)}`);

    try {
      const old = draining.get(slot);

      if (old) await exited(old);

      rmSync(paths.build(slot), { recursive: true, force: true });
      await runtime.prepare(app);
      await runtime.build(app, slot);
      await syncSchema(app);

      const server = await launch(slot);

      if (stopping) {
        await stopServer(server.child);

        return;
      }

      swap(server);
      log.write('supervisor', `serving ${paths.distDir(slot)} (pid ${server.child.pid})`);

      if (!booted) {
        booted = true;
        onBoot?.();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const output = error instanceof StepError ? tail(error.output) : '';
      const lastError = output ? `${message}\n${output}` : message;

      log.write('supervisor', `update failed: ${message}`);

      if (!booted) throw Object.assign(new Error(lastError), { boot: true });

      save({ state: current ? 'update failed' : 'crashed', lastError });
    }
  }

  const queue = createBuildQueue(update);
  let watcher: { close: () => void } | undefined;
  let stopOwnership = () => {};

  const shutdown = async (reason: string, code = 0) => {
    if (stopping) return;
    stopping = true;
    log.write('supervisor', `stopping: ${reason}`);
    watcher?.close();
    stopOwnership();
    await proxy.close();

    await Promise.all([
      ...(current ? [stopServer(current.child)] : []),
      ...[...draining.values()].map(stopServer),
    ]);

    removeRegistration(file, registration);
    rmSync(paths.builds, { recursive: true, force: true });
    process.exit(code);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGHUP', () => void shutdown('SIGHUP'));

  stopOwnership = watchOwnership({
    file,
    owner: registration,
    onLost: () => void shutdown('its registration was removed or taken over'),
  });

  try {
    await update();
  } catch (error) {
    onBoot?.(error as Error);
    await shutdown('the first build failed', 1);

    return;
  }

  watcher = watchApp({
    dir,
    onChange: () => {
      log.write('supervisor', 'change seen; rebuilding');
      queue.trigger();
    },
  });
}
