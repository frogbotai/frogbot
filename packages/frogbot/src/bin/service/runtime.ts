import { type ChildProcess, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveNextBin } from '../runNext.js';
import type { Log } from './log.js';
import { appPaths, type Slot } from './paths.js';
import { HOST } from './ports.js';

/** The app a runtime builds and serves, and where its output goes. */
export type App = {
  dir: string;
  /** The environment children start from: the shell's, without the supervisor's loaded `.env`. */
  env: NodeJS.ProcessEnv;
  log: Log;
};

/**
 * The only framework-specific part of `frogbot up`: the supervisor, proxy, watcher and registration
 * call only this, so another framework's runtime plugs in beside `nextRuntime`.
 */
export type AppRuntime = {
  /** Writes what the build reads (the import map). */
  prepare: (app: App) => Promise<void>;
  /** Builds into `slot`, never the one being served. */
  build: (app: App, slot: Slot) => Promise<void>;
  /** Starts a production server on `slot`'s build at `127.0.0.1:<port>`, leading its own process group. */
  start: (app: App, slot: Slot, port: number) => ChildProcess;
};

export class StepError extends Error {
  constructor(
    message: string,
    readonly output: string,
  ) {
    super(message);
  }
}

/** FrogBot's own `bin.js`, run with this Node. */
export const frogbotBin = fileURLToPath(new URL('../../../bin.js', import.meta.url));

const TAIL_BYTES = 32 * 1024;

const lifeline = pathToFileURL(fileURLToPath(new URL('./lifeline.js', import.meta.url))).href;

/**
 * A child's stdio and env with a lifeline: fd 3 is a pipe only the supervisor holds, and a preload
 * exits the child when it closes, so a supervisor killed with `SIGKILL` leaves no process behind.
 */
export function withLifeline(env: NodeJS.ProcessEnv): {
  env: NodeJS.ProcessEnv;
  stdio: ['ignore', 'pipe', 'pipe', 'pipe'];
} {
  return {
    env: {
      ...env,
      FROGBOT_LIFELINE_FD: '3',
      NODE_OPTIONS: [env.NODE_OPTIONS, `--import=${lifeline}`].filter(Boolean).join(' '),
    },
    stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
  };
}

/** Keeps the last `TAIL_BYTES` of a child's output. */
export function outputTail(child: ChildProcess): () => string {
  let output = '';
  const keep = (chunk: Buffer) => {
    output = (output + String(chunk)).slice(-TAIL_BYTES);
  };

  child.stdout?.on('data', keep);
  child.stderr?.on('data', keep);

  return () => output;
}

/**
 * Runs a child to its end, its output in the log unless `quiet`; a failure carries the output's tail.
 */
export function runStep(
  app: App,
  name: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  { quiet = false } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: app.dir, ...withLifeline(env) });
    const tail = outputTail(child);

    if (!quiet) {
      const toLog = app.log.stream(name);

      child.stdout?.on('data', toLog);
      child.stderr?.on('data', toLog);
    }

    child.on('error', (error) =>
      reject(new StepError(`${name} could not start: ${error.message}`, tail())),
    );

    child.on('close', (code, signal) => {
      if (code === 0) resolve(tail());
      else reject(new StepError(`${name} failed (${signal ?? `exit ${code}`})`, tail()));
    });
  });
}

const productionEnv = (app: App, slot: Slot): NodeJS.ProcessEnv => ({
  ...app.env,
  NODE_ENV: 'production',
  FROGBOT_DIST_DIR: appPaths(app.dir).distDir(slot),
  FROGBOT_SERVICE: undefined,
});

export const nextRuntime: AppRuntime = {
  async prepare(app) {
    await runStep(app, 'importmap', [frogbotBin, 'generate:importmap'], {
      ...app.env,
      FROGBOT_SERVICE: undefined,
    });
  },

  async build(app, slot) {
    await runStep(app, 'build', [resolveNextBin(app.dir), 'build'], {
      ...productionEnv(app, slot),
      NODE_OPTIONS: app.env.NODE_OPTIONS ?? '--no-deprecation --max-old-space-size=8000',
    });
  },

  start(app, slot, port) {
    const child = spawn(
      process.execPath,
      [resolveNextBin(app.dir), 'start', '-p', String(port), '-H', HOST],
      { cwd: app.dir, detached: true, ...withLifeline(productionEnv(app, slot)) },
    );

    const toLog = app.log.stream(`server ${slot}`);

    child.stdout?.on('data', toLog);
    child.stderr?.on('data', toLog);

    return child;
  },
};
