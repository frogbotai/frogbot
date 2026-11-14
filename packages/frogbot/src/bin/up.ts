import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

import nextEnvImport from '@next/env';

import { findNextConfig } from './runNext.js';
import {
  installLaunchAgent,
  launchAgentBin,
  launchAgentFile,
  uninstallLaunchAgent,
} from './service/launchAgent.js';
import { appDir, appPaths, registrationFile, serviceId } from './service/paths.js';
import {
  choosePort,
  HOST,
  parsePort,
  parsePortNumber,
  readSavedPort,
  writeSavedPort,
} from './service/ports.js';
import {
  isAlive,
  listRegistrations,
  readRegistration,
  type Registration,
} from './service/registration.js';
import { frogbotBin } from './service/runtime.js';
import { stopLeftServer } from './service/stop.js';
import { BOOT_FAILED, MOVE_SIGNAL, supervise } from './service/supervisor.js';

const STDERR_LIMIT = 8 * 1024;
const POLL_MS = 200;
const LAUNCHD_REGISTER_MS = 30_000;
const MOVE_MS = 10_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function shellEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...(nextEnvImport.initialEnv ?? process.env),
  } as NodeJS.ProcessEnv;

  for (const key of Object.keys(env)) if (key.startsWith('FROGBOT_SERVICE')) delete env[key];

  return env;
}

/** How long ago `since` was, rounded down: `45 s`, `2 min`, `3 h`, `2 d`. */
export function age(since: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - since) / 1000));

  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h`;

  return `${Math.floor(seconds / 86_400)} d`;
}

/** What `up` prints for an app already up: that it is watching, its last build, and its last error. */
export function alreadyUp(found: Registration, now = Date.now()): string[] {
  const built = Date.parse(found.builtAt ?? '');
  const last = Number.isNaN(built) ? '' : ` (last build ${age(built, now)} ago)`;

  return [
    `[frogbot] ${found.dir} is already up at ${found.url}, watching for changes${last}`,
    ...(found.lastError ? [`[frogbot] last error: ${found.lastError}`] : []),
  ];
}

export type UpOptions = { port?: number | 'auto'; autostart: boolean };

export function parseUpArgs(args: string[]): UpOptions {
  const options: UpOptions = { autostart: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--autostart') options.autostart = true;
    else if (arg === '--port' || arg === '-p') options.port = parsePort(args[++i]);
    else if (arg.startsWith('--port=')) options.port = parsePort(arg.slice('--port='.length));
    else {
      throw new Error(
        `[frogbot] usage: frogbot up [--port <n|auto>] [--autostart]; "${arg}" isn't one of them`,
      );
    }
  }

  return options;
}

const otherPorts = (id: string) =>
  new Set(
    listRegistrations()
      .filter((registration) => registration.id !== id && isAlive(registration.pid))
      .map((registration) => registration.port),
  );

async function pickPort(
  dir: string,
  id: string,
  requested?: number | 'auto',
): Promise<{ port: number; chosen: boolean }> {
  const saved = readSavedPort(appPaths(dir).port);
  const taken = otherPorts(id);

  if (typeof requested === 'number') {
    return { port: await choosePort({ requested, taken }), chosen: true };
  }

  const fallback = saved && requested === 'auto' ? { ...saved, chosen: false } : saved;
  const port = await choosePort({ saved: fallback, taken });

  return { port, chosen: Boolean(fallback?.chosen) };
}

function readTail(file: string, from = 0): string {
  try {
    const text = readFileSync(file, 'utf8');

    return text.slice(Math.max(from, text.length - STDERR_LIMIT)).trim();
  } catch {
    return '';
  }
}

const sizeOf = (file: string) => (existsSync(file) ? statSync(file).size : 0);

async function answers(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });

    await response.body?.cancel();

    return response.status < 500;
  } catch {
    return false;
  }
}

async function superviseHere(): Promise<void> {
  const dir = appDir(process.cwd());
  const id = serviceId(dir);
  const found = readRegistration(registrationFile(id));

  if (found && found.pid !== process.pid && isAlive(found.pid)) {
    process.stderr.write(`${alreadyUp(found).join('\n')}\n`);

    return;
  }

  process.stderr.on('error', () => {});

  await stopLeftServer(found?.serverPid, dir);

  const port = parsePortNumber(process.env.FROGBOT_SERVICE_PORT) ?? (await pickPort(dir, id)).port;

  await supervise({
    dir,
    port,
    autostart: process.env.FROGBOT_SERVICE_AUTOSTART === '1',
    env: shellEnv(),
    onBoot: (error) => {
      if (error) process.stderr.write(`${BOOT_FAILED} ${error.message}\n`);
    },
  });
}

async function schemaStep(): Promise<void> {
  const { loadConfig } = await import('../config/load.js');
  const config = await loadConfig({ cwd: process.cwd(), mode: 'runtime' });
  const { syncSchema } = (await config._internal.payloadConfig).db as {
    syncSchema?: import('../database/types.js').SyncSchema; // eslint-disable-line @typescript-eslint/consistent-type-imports -- a type-only use in a lazily loaded path
  };

  const result = syncSchema
    ? await syncSchema({ config })
    : { ok: true as const, applied: [], kept: [] };

  process.stdout.write(
    `\n${JSON.stringify({
      frogbot: 'schema',
      ok: result.ok,
      applied: result.applied.length,
      kept: result.kept,
      ...(!result.ok && { error: result.error }),
    })}\n`,
  );

  process.exit(result.ok ? 0 : 1);
}

type Deps = {
  log?: (line: string) => void;
  spawnSupervisor?: (
    dir: string,
    env: NodeJS.ProcessEnv,
  ) => import('node:child_process').ChildProcess; // eslint-disable-line @typescript-eslint/consistent-type-imports -- matches spawn's return
  install?: typeof installLaunchAgent;
  uninstall?: typeof uninstallLaunchAgent;
  platform?: NodeJS.Platform;
};

const defaultSpawn = (dir: string, env: NodeJS.ProcessEnv) =>
  spawn(process.execPath, [frogbotBin, 'up'], {
    cwd: dir,
    env,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  });

/**
 * `frogbot up [--port <n>] [--autostart]`: starts the app's supervisor in the background, waits until
 * the app answers, and prints its URL and log. A first build or start that fails prints the error's
 * tail and exits 1, leaving nothing behind.
 */
export async function up(args: string[] = [], deps: Deps = {}): Promise<void> {
  if (process.env.FROGBOT_SERVICE === 'schema') return schemaStep();
  if (process.env.FROGBOT_SERVICE === 'supervise') return superviseHere();

  const {
    log = console.log,
    spawnSupervisor = defaultSpawn,
    install = installLaunchAgent,
    uninstall = uninstallLaunchAgent,
    platform = process.platform,
  } = deps;

  const options = parseUpArgs(args);

  if (options.autostart && platform !== 'darwin') {
    throw new Error(
      '[frogbot] --autostart needs macOS (a LaunchAgent); elsewhere run `frogbot up` after each login',
    );
  }

  const dir = appDir(process.cwd());

  if (!findNextConfig(dir)) {
    throw new Error(
      `[frogbot] no next.config.{ts,mjs,js,cjs} in ${dir}; run \`frogbot up\` in your app's folder`,
    );
  }

  const id = serviceId(dir);
  const file = registrationFile(id);
  const found = readRegistration(file);
  const paths = appPaths(dir);

  if (found && isAlive(found.pid)) {
    if (options.autostart && !found.autostart) {
      throw new Error(
        `[frogbot] ${dir} is already up at ${found.url}, without autostart; run \`frogbot down\`, then \`frogbot up --autostart\``,
      );
    }

    await keepRunning(found, options.port, log);

    return;
  }

  const { port, chosen } = await pickPort(dir, id, options.port);

  writeSavedPort(paths.port, { port, chosen });

  const env: NodeJS.ProcessEnv = {
    ...shellEnv(),
    FROGBOT_SERVICE: 'supervise',
    FROGBOT_SERVICE_PORT: String(port),
    ...(options.autostart && { FROGBOT_SERVICE_AUTOSTART: '1' }),
  };

  let failed: () => string | undefined;
  let release = () => {};

  let cleanup = async () => {};

  if (options.autostart) {
    const from = sizeOf(paths.launchdLog);
    const keep = (key: string) =>
      (key.startsWith('FROGBOT_') && key !== 'FROGBOT_SERVICE_PORT') ||
      ['PATH', 'XDG_STATE_HOME', 'NODE_OPTIONS'].includes(key);

    const variables = Object.fromEntries(
      Object.entries(env).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string' && keep(entry[0]),
      ),
    );

    const started = Date.now();

    await install({
      id,
      dir,
      node: process.execPath,
      bin: launchAgentBin(dir, frogbotBin),
      log: paths.launchdLog,
      env: variables,
    });

    failed = () => {
      const text = readTail(paths.launchdLog, from);

      if (text.includes(BOOT_FAILED)) return text;
      if (!readRegistration(file) && Date.now() - started > LAUNCHD_REGISTER_MS) {
        return text || 'launchd did not start the supervisor';
      }

      return undefined;
    };

    cleanup = async () => {
      await uninstall(id);
    };
  } else {
    const child = spawnSupervisor(dir, env);
    let stderr = '';
    let exit: string | undefined;

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = (stderr + String(chunk)).slice(-STDERR_LIMIT);
    });

    child.once('exit', (code, signal) => {
      exit = signal ?? `exit ${code}`;
    });

    child.once('error', (error) => {
      exit = error.message;
    });

    failed = () =>
      exit === undefined ? undefined : stderr.trim() || `the supervisor stopped (${exit})`;

    release = () => {
      child.stderr?.destroy();
      child.unref();
    };

    cleanup = () => Promise.resolve(release());
  }

  try {
    await waitUntilUp(file, failed);
  } catch (error) {
    await cleanup();
    throw withLogTail(error, paths.log);
  }

  release();

  const registration = readRegistration(file)!;

  log(`[frogbot] ${registration.dir} is up at ${registration.url}`);
  log(`[frogbot] log: ${registration.log}`);
  if (options.autostart) log(`[frogbot] starts at login: ${launchAgentFile(id)}`);
}

async function keepRunning(
  found: Registration,
  requested: number | 'auto' | undefined,
  log: (line: string) => void,
): Promise<void> {
  const file = appPaths(found.dir).port;

  if (requested === 'auto' || requested === found.port) {
    writeSavedPort(file, { port: found.port, chosen: requested !== 'auto' });
  }

  if (requested === undefined || requested === 'auto' || requested === found.port) {
    for (const line of alreadyUp(found)) log(line);

    return;
  }

  await choosePort({ requested, taken: otherPorts(found.id) });
  writeSavedPort(file, { port: requested, chosen: true });
  process.kill(found.pid, MOVE_SIGNAL);

  const registration = registrationFile(found.id);
  const deadline = Date.now() + MOVE_MS;

  for (;;) {
    const moved = readRegistration(registration);

    if (moved?.port === requested) break;

    if (Date.now() > deadline || !moved || !isAlive(moved.pid)) {
      throw new Error(
        `[frogbot] couldn't move ${found.dir} to port ${requested}${moved?.lastError ? `: ${moved.lastError}` : ''}; see ${found.log}`,
      );
    }

    await sleep(POLL_MS);
  }

  log(`[frogbot] moved ${found.dir} to http://${HOST}:${requested}`);
}

async function waitUntilUp(file: string, failed: () => string | undefined): Promise<void> {
  for (;;) {
    const reason = failed();

    if (reason !== undefined) throw new Error(reason);

    const registration = readRegistration(file);

    if (registration?.state === 'running' && (await answers(registration.url))) return;

    await sleep(POLL_MS);
  }
}

function withLogTail(error: unknown, logFile: string): Error {
  const message = (error instanceof Error ? error.message : String(error))
    .replaceAll(BOOT_FAILED, '')
    .trim();

  const tail = readTail(logFile).split('\n').slice(-20).join('\n');

  return new Error(
    `[frogbot] up failed:\n${message}${tail && !message.includes(tail) ? `\n\nLast lines of ${logFile}:\n${tail}` : ''}`,
  );
}
