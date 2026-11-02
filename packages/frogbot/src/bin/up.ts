import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

import nextEnvImport from '@next/env';

import { findNextConfig } from './runNext.js';
import {
  installLaunchAgent,
  launchAgentFile,
  uninstallLaunchAgent,
} from './service/launchAgent.js';
import { appDir, appPaths, registrationFile, serviceId } from './service/paths.js';
import { choosePort, parsePort } from './service/ports.js';
import { isAlive, listRegistrations, readRegistration } from './service/registration.js';
import { frogbotBin } from './service/runtime.js';
import { BOOT_FAILED, supervise } from './service/supervisor.js';

const STDERR_LIMIT = 8 * 1024;
const POLL_MS = 200;
const LAUNCHD_REGISTER_MS = 30_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function shellEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...(nextEnvImport.initialEnv ?? process.env),
  } as NodeJS.ProcessEnv;

  for (const key of Object.keys(env)) if (key.startsWith('FROGBOT_SERVICE')) delete env[key];

  return env;
}

export type UpOptions = { port?: number; autostart: boolean };

export function parseUpArgs(args: string[]): UpOptions {
  const options: UpOptions = { autostart: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--autostart') options.autostart = true;
    else if (arg === '--port' || arg === '-p') options.port = parsePort(args[++i]);
    else if (arg.startsWith('--port=')) options.port = parsePort(arg.slice('--port='.length));
    else {
      throw new Error(
        `[frogbot] usage: frogbot up [--port <n>] [--autostart]; "${arg}" isn't one of them`,
      );
    }
  }

  return options;
}

function savedPort(dir: string): number | undefined {
  try {
    return parsePort(readFileSync(appPaths(dir).port, 'utf8').trim());
  } catch {
    return undefined;
  }
}

function pickPort(dir: string, id: string, requested?: number): Promise<number> {
  const taken = new Set(
    listRegistrations()
      .filter((registration) => registration.id !== id && isAlive(registration.pid))
      .map((registration) => registration.port),
  );

  return choosePort({ requested, saved: savedPort(dir), taken });
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
    process.stderr.write(`[frogbot] ${dir} is already up at ${found.url}\n`);

    return;
  }

  process.stderr.on('error', () => {});

  const port = parsePort(process.env.FROGBOT_SERVICE_PORT) ?? (await pickPort(dir, id));

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

  for (const statement of result.applied) process.stderr.write(`${statement}\n`);

  for (const kept of result.kept) process.stderr.write(`[frogbot] ${kept}\n`);

  process.stdout.write(
    `\n${JSON.stringify({
      frogbot: 'schema',
      ok: result.ok,
      applied: result.applied.length,
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
    log(`[frogbot] ${dir} is already up at ${found.url}`);
    if (options.autostart && !found.autostart) {
      log('[frogbot] it has no autostart; run `frogbot down`, then `frogbot up --autostart`');
    }

    return;
  }

  const port = await pickPort(dir, id, options.port);
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
      key.startsWith('FROGBOT_') || ['PATH', 'XDG_STATE_HOME', 'NODE_OPTIONS'].includes(key);

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
      bin: frogbotBin,
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
