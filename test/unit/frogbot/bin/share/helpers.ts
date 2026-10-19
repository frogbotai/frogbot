import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

import { onTestFinished } from 'vitest';

import type {
  ShareConfig,
  ShareEnv,
  ShareIO,
} from '../../../../../packages/frogbot/src/bin/share/io.js';

const execFileAsync = promisify(execFile);

const gitEnv: NodeJS.ProcessEnv = {
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))),
  NODE_ENV: process.env.NODE_ENV,
};

export async function tempDir(): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'frogbot-share-test-')));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return dir;
}

export async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
}

export async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(
    'git',
    [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { cwd, env: gitEnv },
  );

  return stdout;
}

export async function gitRepo(root: string): Promise<void> {
  await git(root, 'init', '-q');
}

export type TestIO = {
  io: ShareIO;
  stdout: () => string[];
  stderr: () => string[];
  opened: string[];
  asked: string[];
};

const emptyConfig = { collections: [], db: {} } as unknown as ShareConfig;

/** A `ShareIO` that records its output and answers prompts with `answers`, or fails when none is given. */
export function testIO({
  cwd,
  env,
  isTTY = false,
  confirm,
  select,
  multiselect,
  config = emptyConfig,
}: {
  cwd: string;
  env: ShareEnv;
  isTTY?: boolean;
  confirm?: boolean;
  select?: string;
  multiselect?: string[];
  config?: ShareConfig;
}): TestIO {
  let out = '';
  let err = '';
  const opened: string[] = [];
  const asked: string[] = [];

  const answer = <T>(message: string, value: T | undefined): T => {
    asked.push(message);

    if (value === undefined) throw new Error(`Unexpected prompt: ${message}`);

    return value;
  };

  const io: ShareIO = {
    cwd,
    env,
    isTTY,
    stdout: { write: (text: string) => (out += text) },
    stderr: { write: (text: string) => (err += text) },
    prompts: {
      confirm: (message) => Promise.resolve(answer(message, confirm)),
      select: (message) => Promise.resolve(answer(message, select)),
      multiselect: (message) => Promise.resolve(answer(message, multiselect)),
    },
    openBrowser: (url) => opened.push(url),
    loadConfig: () => Promise.resolve(config),
  };

  const lines = (text: string) => text.split('\n').filter(Boolean);

  return { io, stdout: () => lines(out), stderr: () => lines(err), opened, asked };
}

/** A minimal app that passes the pre-checks. */
export async function writeApp(root: string, files: Record<string, string> = {}): Promise<void> {
  await writeFiles(root, {
    'package.json': '{"name":"@acme/Deals App"}',
    'pnpm-lock.yaml': '',
    'src/frogbot.config.ts': 'export default {};',
    'src/page.tsx': 'export default 1;',
    ...files,
  });
}
