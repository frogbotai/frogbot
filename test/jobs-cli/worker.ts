import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'libsql';

export type WorkerMessage = {
  type: string;
  id?: number;
  ids?: number[];
  other?: number;
  runtimeReady?: boolean;
  configuredAutorun?: number;
  activeAutorun?: number;
  status?: string;
};

export type WorkerJob = {
  id: number;
  queue: string;
  task_slug: string;
  processing: number;
  completed_at: string | null;
  total_tried: number;
  lease_owner: string | null;
  lease_until: string | null;
};

const fixtureDirectory = fileURLToPath(new URL('.', import.meta.url));
const executable = fileURLToPath(new URL('../../packages/frogbot/bin.js', import.meta.url));

export async function startWorker({
  args,
  scenario = 'queue',
  configPath,
}: {
  args: string[];
  scenario?: string;
  configPath?: string;
}) {
  const directory = await mkdtemp(join(tmpdir(), 'frogbot-jobs-cli-'));
  const databasePath = join(directory, 'jobs.sqlite');
  const env = { ...process.env };

  delete env.NODE_OPTIONS;
  delete env.FROGBOT_CONFIG_PATH;
  delete env.PAYLOAD_DROP_DATABASE;
  delete env.PAYLOAD_MIGRATING;
  delete env.NEXT_PHASE;
  delete env.ROOT_DIR;

  if (configPath) env.FROGBOT_CONFIG_PATH = configPath;

  const child = spawn(process.execPath, [executable, 'jobs:run', ...args], {
    cwd: fixtureDirectory,
    env: {
      ...env,
      NODE_ENV: 'test',
      PAYLOAD_DISABLE_ADMIN: 'true',
      JOBS_CLI_DATABASE: databasePath,
      JOBS_CLI_SCENARIO: scenario,
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const messages: WorkerMessage[] = [];
  const events = new EventEmitter();
  let output = '';
  let failure: Error | undefined;
  let result: { code: number | null; signal: NodeJS.Signals | null } | undefined;

  child.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });

  child.stderr.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });

  child.on('message', (message: WorkerMessage) => {
    messages.push(message);
    events.emit('change');
  });

  child.on('error', (error) => {
    failure = error;
    events.emit('change');
  });

  const closed = new Promise<void>((resolve) => {
    child.once('close', (code, signal) => {
      result = { code, signal };
      events.emit('change');
      resolve();
    });
  });

  function waitFor<T>(read: () => T | undefined, description: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const finish = (error?: Error, value?: T) => {
        clearTimeout(timer);
        events.off('change', check);

        if (error) reject(error);
        else resolve(value as T);
      };
      const check = () => {
        const value = read();

        if (value !== undefined) finish(undefined, value);
        else if (failure || result) {
          finish(
            new Error(
              `CLI closed before ${description}: ${JSON.stringify(result)}\n${failure ?? ''}\n${output}`,
            ),
          );
        }
      };
      const timer = setTimeout(() => {
        finish(new Error(`Timed out waiting for ${description}\n${output}`));
      }, 30_000);

      events.on('change', check);
      check();
    });
  }

  function query<T>(sql: string): T[] {
    const database = new Database(databasePath, { readonly: true, fileMustExist: true });

    try {
      return database.prepare(sql).all() as T[];
    } finally {
      database.close();
    }
  }

  return {
    child,
    messages,
    databasePath,
    output: () => output,
    message: (type: string, count = 1) =>
      waitFor(() => messages.filter((message) => message.type === type)[count - 1], type),
    exit: () => waitFor(() => result, 'worker exit'),
    send: (type: string) =>
      new Promise<void>((resolve, reject) => {
        child.send({ type }, (error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
    jobs: () => query<WorkerJob>('SELECT * FROM payload_jobs ORDER BY id'),
    executions: () =>
      query<{ job: string; runtime_ready: number }>(
        'SELECT job, runtime_ready FROM executions ORDER BY id',
      ),
    cleanup: async () => {
      if (!result) child.kill('SIGKILL');

      await closed;
      await rm(directory, { recursive: true, force: true });
    },
  };
}
