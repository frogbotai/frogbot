import type { ChildProcess } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { FROGBOT_VERSION } from '../../version.js';
import { createBackoff } from './backoff.js';
import { isEnvOnly, publicEnvChanged, readPublicEnv } from './envChanges.js';
import { checkHealth } from './health.js';
import { pickError } from './lastError.js';
import { createLog, type Log } from './log.js';
import { appPaths, registrationFile, serviceId, type Slot } from './paths.js';
import { freePort, HOST, readSavedPort, writeSavedPort } from './ports.js';
import { createProxy, drained, type Upstream } from './proxy.js';
import { createBuildQueue, type RunKind } from './queue.js';
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
  outputTail,
  runStep,
  StepError,
} from './runtime.js';
import { watchApp } from './watch.js';

/** The marker `frogbot up` looks for in a LaunchAgent's log when the first build fails. */
export const BOOT_FAILED = '[frogbot] up failed:';

const DRAIN_MS = 30_000;
const ERROR_TAIL_LINES = 30;
const MAX_ERROR = 200;

type Server = {
  slot: Slot;
  port: number;
  child: ChildProcess;
  startedAt: number;
  upstream?: Upstream;
};

/** Sent by `frogbot up --port <n>` after it saves the new port in `.frogbot/port`. */
export const MOVE_SIGNAL = 'SIGUSR2';

const tail = (text: string) => text.trimEnd().split('\n').slice(-ERROR_TAIL_LINES).join('\n');

function summarize(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const why = error instanceof StepError ? pickError(error.output) : undefined;

  const text = why && !message.includes(why) ? `${message}: ${why}` : message;

  return text.length > MAX_ERROR ? `${text.slice(0, MAX_ERROR - 1)}…` : text;
}

function includesBuilds(dir: string): boolean {
  try {
    return readFileSync(join(dir, 'tsconfig.json'), 'utf8').includes('.frogbot/builds/');
  } catch {
    return false;
  }
}

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

type SchemaLine = {
  frogbot: 'schema';
  ok: boolean;
  applied: number;
  kept?: string[];
  error?: string;
};

/** Writes the schema step's kept line when it differs from the last one; returns it as the new last. */
export function reportKept(
  kept: string[],
  last: string | undefined,
  write: (line: string) => void,
): string {
  const line = kept.join('\n');

  if (line && line !== last) write(line);

  return line;
}

async function syncSchema(app: App, reported: { kept?: string }): Promise<void> {
  let output: string;

  try {
    output = await runStep(
      app,
      'schema',
      [frogbotBin, 'up'],
      { ...app.env, NODE_ENV: 'production', FROGBOT_SERVICE: 'schema' },
      { quiet: true },
    );
  } catch (error) {
    const stepOutput = error instanceof StepError ? error.output : '';
    const line = parseSchemaLine(stepOutput);

    app.log.write('schema', stepOutput);

    if (line?.error) throw new StepError(`schema sync refused: ${line.error}`, '');

    throw error;
  }

  const line = parseSchemaLine(output);

  if (!line) {
    app.log.write('schema', output);

    throw new StepError('schema sync printed no result', output);
  }

  reported.kept = reportKept(line.kept ?? [], reported.kept, (kept) =>
    app.log.write('schema', kept),
  );

  if (!line.ok) throw new StepError(`schema sync refused: ${line.error}`, '');
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
  const reported: { kept?: string } = {};
  let current: Server | undefined;
  let typesFile: string | undefined;
  let publicEnv = readPublicEnv(dir);
  let booted = false;
  let stopping = false;

  const skipped = await proxy.listen(port);
  const saved = readSavedPort(paths.port);
  let chosen = saved?.port === port && saved.chosen;

  writeSavedPort(paths.port, { port, chosen });

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

  for (const host of skipped) log.write('supervisor', `not listening on ${host}: no IPv6 here`);

  if (includesBuilds(dir)) {
    log.write(
      'supervisor',
      'tsconfig.json includes .frogbot/builds/…; remove those lines or a deleted route breaks `tsc`',
    );
  }

  async function launch(slot: Slot): Promise<Server> {
    const serverPort = await freePort();
    const child = runtime.start(app, slot, serverPort);
    const output = outputTail(child);
    const server: Server = { slot, port: serverPort, child, startedAt: Date.now() };

    try {
      await checkHealth(serverPort, child);
    } catch (error) {
      await stopServer(child);
      throw new StepError((error as Error).message, output());
    }

    return server;
  }

  function swap(server: Server, { built = false } = {}) {
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
      ...(built && { builtAt: new Date().toISOString() }),
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
          if (stopping || current !== server) {
            void stopServer(next.child);

            return;
          }

          swap(next);
          log.write('supervisor', `server back up (pid ${next.child.pid})`);
        },
        (error: unknown) => {
          if (stopping || current !== server) return;

          const message = `restart failed: ${summarize(error)}`;

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
      typesFile = (await runtime.prepare(app)).typesFile ?? typesFile;

      const baked = readPublicEnv(dir);

      await runtime.build(app, slot);
      await syncSchema(app, reported);

      const server = await launch(slot);

      if (stopping) {
        await stopServer(server.child);

        return;
      }

      swap(server, { built: true });
      publicEnv = baked;
      log.write('supervisor', `serving ${paths.distDir(slot)} (pid ${server.child.pid})`);

      if (!booted) {
        booted = true;
        onBoot?.();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const output = error instanceof StepError ? tail(error.output) : '';

      log.write('supervisor', `update failed: ${summarize(error)}`);

      if (!booted) {
        throw Object.assign(new Error(output ? `${message}\n${output}` : message), { boot: true });
      }

      save({ state: current ? 'update failed' : 'crashed', lastError: summarize(error) });
    }
  }

  async function restartOnEnv(): Promise<void> {
    if (!current) return update();

    const { slot } = current;
    const { state, lastError } = registration;

    try {
      const server = await launch(slot);

      if (stopping) {
        await stopServer(server.child);

        return;
      }

      swap(server);
      if (state === 'update failed') save({ state, lastError });

      log.write(
        'supervisor',
        `serving ${paths.distDir(slot)} with the new .env (pid ${server.child.pid})`,
      );
    } catch (error) {
      log.write('supervisor', `restart failed: ${summarize(error)}`);
      save({ lastError: `restart failed: ${summarize(error)}` });
    }
  }

  const queue = createBuildQueue((kind: RunKind) =>
    kind === 'restart' ? restartOnEnv() : update(),
  );

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
  process.on(MOVE_SIGNAL, () => void move());

  async function move() {
    const next = readSavedPort(paths.port);

    if (stopping || !next || next.port === registration.port) return;

    try {
      const skippedHosts = await proxy.move(next.port);

      for (const host of skippedHosts) {
        log.write('supervisor', `not listening on ${host}: no IPv6 here`);
      }
    } catch (error) {
      log.write('supervisor', `couldn't move to port ${next.port}: ${summarize(error)}`);
      writeSavedPort(paths.port, { port: registration.port, chosen });
      save({ lastError: `couldn't move to port ${next.port}: ${summarize(error)}` });

      return;
    }

    chosen = next.chosen;
    save({ port: next.port, url: `http://${HOST}:${next.port}` });
    log.write('supervisor', `moved to ${registration.url}`);
  }

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
    ignore: () => typesFile,
    onChange: (changed) => {
      if (isEnvOnly(changed)) {
        const keys = publicEnvChanged(publicEnv, readPublicEnv(dir));

        if (!keys.length) {
          log.write('supervisor', 'only .env changed; restarting on the current build');
          queue.trigger('restart');

          return;
        }

        log.write('supervisor', `${keys.join(', ')} changed; rebuilding`);
      } else {
        log.write('supervisor', 'change seen; rebuilding');
      }

      queue.trigger('update');
    },
  });
}
