import type { ChildProcess } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { FROGBOT_VERSION } from '../../version.js';
import { createBackoff } from './backoff.js';
import { type DevRuntime, devRuntime } from './devRuntime.js';
import { isEnvOnly, type PublicEnv, publicEnvChanged, readPublicEnv } from './envChanges.js';
import { checkHealth } from './health.js';
import { summarize } from './lastError.js';
import { createLog, type Log } from './log.js';
import { appPaths, registrationFile, serviceId, type Slot } from './paths.js';
import { freePort, HOST, readSavedPort, writeSavedPort } from './ports.js';
import { createProxy, drained, type Upstream } from './proxy.js';
import { createBuildQueue, type RunKind } from './queue.js';
import {
  type Registration,
  removeRegistration,
  type ServiceMode,
  watchOwnership,
  writeRegistration,
} from './registration.js';
import { type App, type AppRuntime, nextRuntime, outputTail, StepError } from './runtime.js';
import { syncSchema } from './schema.js';
import { exited, signalGroup, stopServer } from './stop.js';
import { isRootFile, watchApp } from './watch.js';

/** The marker `frogbot up` looks for in a LaunchAgent's log when the first build fails. */
export const BOOT_FAILED = '[frogbot] up failed:';

const DRAIN_MS = 30_000;
const ERROR_TAIL_LINES = 30;

type Server = {
  mode: ServiceMode;
  slot: Slot;
  port: number;
  child: ChildProcess;
  startedAt: number;
  upstream?: Upstream;
};

/**
 * Sent by `frogbot up` after it saves a new port in `.frogbot/port` or a new mode in
 * `.frogbot/mode-request`.
 */
export const SETTINGS_SIGNAL = 'SIGUSR2';

const tail = (text: string) => text.trimEnd().split('\n').slice(-ERROR_TAIL_LINES).join('\n');

function includesBuilds(dir: string): boolean {
  try {
    return readFileSync(join(dir, 'tsconfig.json'), 'utf8').includes('.frogbot/builds/');
  } catch {
    return false;
  }
}

export type SuperviseOptions = {
  dir: string;
  port: number;
  autostart: boolean;
  env: NodeJS.ProcessEnv;
  mode?: ServiceMode;
  runtimes?: { production: AppRuntime; dev: DevRuntime };
  /** Called once the app first answers, or with the error when it never does. */
  onBoot?: (error?: Error) => void;
};

/**
 * The long-lived `frogbot up` process: holds the public port, builds into the idle slot on every
 * change (one build at a time), syncs the schema, starts a server on that build and swaps the proxy to
 * it once it answers. A failed update keeps the old server; a crashed server restarts on its build.
 * In dev mode it runs `next dev` instead, restarting it only for root files (`src/` hot reloads).
 */
export async function supervise({
  dir,
  port,
  autostart,
  env,
  mode: startMode = 'production',
  runtimes = { production: nextRuntime, dev: devRuntime },
  onBoot,
}: SuperviseOptions): Promise<void> {
  const paths = appPaths(dir);
  const id = serviceId(dir);
  const file = registrationFile(id, env);
  const log: Log = createLog(paths.log);
  const app: App = { dir, env, log };
  const proxy = createProxy();
  const backoff = createBackoff();
  const draining = new Map<Slot, Set<ChildProcess>>();
  const reported: { kept?: string } = {};
  let current: Server | undefined;
  let mode = startMode;
  let switchTo: ServiceMode | undefined;
  let relaunching: Promise<void> = Promise.resolve();
  let typesFile: string | undefined;
  let publicEnv = readPublicEnv(dir, env);
  let building: PublicEnv | undefined;
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
    mode,
    log: paths.log,
    autostart,
  };

  const save = (changes: Partial<Registration>) => {
    if (stopping) return;
    Object.assign(registration, changes);
    writeRegistration(file, registration);
  };

  rmSync(paths.modeRequest, { force: true });
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

  async function launch(slot: Slot, serverMode: ServiceMode): Promise<Server> {
    const serverPort = await freePort();
    const child = runtimes[serverMode].start(app, slot, serverPort);
    const output = outputTail(child);
    const server: Server = {
      mode: serverMode,
      slot,
      port: serverPort,
      child,
      startedAt: Date.now(),
    };

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
      const servers = draining.get(previous.slot) ?? new Set();

      draining.set(previous.slot, servers.add(previous.child));

      void (old ? drained(old, DRAIN_MS) : Promise.resolve())
        .then(() => stopServer(previous.child))
        .finally(() => {
          servers.delete(previous.child);
          if (!servers.size && draining.get(previous.slot) === servers) {
            draining.delete(previous.slot);
          }
        });
    }

    save({
      state: 'running',
      mode: server.mode,
      build: server.mode === 'dev' ? undefined : server.slot,
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

      relaunching = launch(server.slot, server.mode).then(
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

  async function stopDevServer(): Promise<boolean> {
    await relaunching;

    const old = current;

    if (old?.mode !== 'dev') return false;

    current = undefined;
    proxy.release();
    save({ serverPid: undefined });
    log.write('supervisor', `stopping the dev server (pid ${old.child.pid}) to restart it`);
    await stopServer(old.child);

    return true;
  }

  async function update(): Promise<void> {
    const from = mode;
    const requested = switchTo;

    switchTo = undefined;
    if (requested) mode = requested;

    const dev = mode === 'dev';
    const slot: Slot = !dev && current?.slot === 'a' ? 'b' : 'a';
    let stopped = false;

    save({ state: booted ? 'building' : 'starting' });

    log.write(
      'supervisor',
      dev ? 'starting the dev server' : `building into ${paths.distDir(slot)}`,
    );

    try {
      if (!dev) {
        await Promise.all([...(draining.get(slot) ?? [])].map(exited));
        rmSync(paths.build(slot), { recursive: true, force: true });
      }

      const prepared = (await runtimes[mode].prepare(app)).typesFile;

      if (prepared && prepared !== typesFile) {
        typesFile = prepared;
        watcher?.forget(prepared);
      }

      const baked = readPublicEnv(dir, env);

      if (!dev) {
        building = baked;
        await runtimes.production.build(app, slot);
        await syncSchema(app, reported);
      }

      stopped = dev && (await stopDevServer());

      const server = await launch(slot, mode);

      if (stopping) {
        await stopServer(server.child);

        return;
      }

      swap(server, { built: !dev });
      if (!dev) publicEnv = baked;

      log.write(
        'supervisor',
        `serving ${dev ? 'next dev' : paths.distDir(slot)} (pid ${server.child.pid})`,
      );

      if (!booted) {
        booted = true;
        onBoot?.();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const output = error instanceof StepError ? tail(error.output) : '';

      if (current) mode = current.mode;
      else if (requested) mode = from;

      log.write('supervisor', `update failed: ${summarize(error)}`);

      if (!booted) {
        throw Object.assign(new Error(output ? `${message}\n${output}` : message), { boot: true });
      }

      save({
        state: current || stopped ? 'update failed' : 'crashed',
        lastError: summarize(error),
      });
    } finally {
      building = undefined;
      if (requested && !switchTo) save({ switching: undefined });
    }
  }

  async function restartOnEnv(): Promise<void> {
    if (current?.mode !== 'production') return update();

    const { slot } = current;
    const { state, lastError } = registration;

    try {
      const server = await launch(slot, 'production');

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
    kind === 'restart' && mode === 'production' && !switchTo ? restartOnEnv() : update(),
  );

  let watcher: ReturnType<typeof watchApp> | undefined;
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
      ...[...draining.values()].flatMap((children) => [...children].map(stopServer)),
    ]);

    removeRegistration(file, registration);
    rmSync(paths.builds, { recursive: true, force: true });
    process.exit(code);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGHUP', () => void shutdown('SIGHUP'));

  process.on(SETTINGS_SIGNAL, () => {
    switchMode();
    void move();
  });

  function switchMode() {
    let wanted: string;

    try {
      wanted = readFileSync(paths.modeRequest, 'utf8').trim();
    } catch {
      return;
    }

    if (
      !stopping &&
      (wanted === 'dev' || wanted === 'production') &&
      (wanted !== mode || switchTo)
    ) {
      switchTo = wanted;
      save({ switching: wanted });
      log.write('supervisor', `switching to ${wanted} mode`);
      queue.trigger('update');
    }

    rmSync(paths.modeRequest, { force: true });
  }

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
      if (mode === 'dev' && !switchTo) {
        const roots = changed.filter(isRootFile);

        if (!roots.length) return;

        log.write('supervisor', `${roots.join(', ')} changed; restarting the dev server`);
        queue.trigger('update');

        return;
      }

      if (isEnvOnly(changed)) {
        const now = readPublicEnv(dir, env);
        const keys = [
          ...new Set([
            ...publicEnvChanged(publicEnv, now),
            ...(building ? publicEnvChanged(building, now) : []),
          ]),
        ];

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
