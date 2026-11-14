import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { onTestFinished } from 'vitest';

import type {
  DeployConfig,
  DeployExecResult,
  DeployIO,
  DeployTarget,
} from '../../../../../packages/frogbot/src/bin/deploy/types.js';

export async function tempDir(): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'frogbot-deploy-test-')));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return dir;
}

export async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
}

/** A Postgres app with migrations wired, a secret, a lockfile and a Dockerfile: every shared check passes. */
export async function writeApp(root: string, files: Record<string, string> = {}): Promise<void> {
  await writeFiles(root, {
    'package.json': '{"name":"@acme/Deals App"}',
    'pnpm-lock.yaml': '',
    Dockerfile: 'FROM node\n',
    'src/frogbot.config.ts': 'export default {};',
    '.env':
      'FROGBOT_SECRET=s3cret-value-123\nDATABASE_URL=postgres://u:p@db.example.com/app\nOPENAI_API_KEY=sk-test-abcdef\nNEXT_PUBLIC_SITE=https://deals.example.com\n',
    ...files,
  });
}

/** A config whose database adapter has `prodMigrations`, with optional upload collections and scheduled tasks. */
export function deployConfig(
  options: {
    prodMigrations?: unknown;
    uploads?: { slug: string; disableLocalStorage?: boolean }[];
    scheduled?: boolean;
  } = {},
): DeployConfig {
  const { uploads = [], scheduled = false } = options;
  const prodMigrations =
    'prodMigrations' in options ? (options.prodMigrations ?? null) : [{ name: 'init' }];

  const config = {
    collections: uploads.map(({ slug, disableLocalStorage }) => ({
      slug,
      upload: { disableLocalStorage },
    })),
    db: { defaultIDType: 'number', init: () => ({}), name: 'postgres', prodMigrations },
    jobs: {
      tasks: scheduled ? [{ slug: 'digest', schedule: [{ cron: '0 * * * *' }] }] : [],
    },
  };

  return config as unknown as DeployConfig;
}

export type ExecCall = { command: string; args: string[]; input?: string };

export type FakeProgram = (args: string[]) => Partial<DeployExecResult> | undefined;

/**
 * A `DeployIO` whose programs are fakes: `programs[name]` answers each call (exit 0 with no output
 * when it returns nothing), and a program not listed isn't installed.
 */
export function testIO({
  cwd,
  env = {},
  isTTY = false,
  confirm,
  config = deployConfig(),
  programs = {},
}: {
  cwd: string;
  env?: Record<string, string | undefined>;
  isTTY?: boolean;
  confirm?: boolean;
  config?: DeployConfig | (() => Promise<DeployConfig>);
  programs?: Partial<Record<string, FakeProgram>>;
}) {
  let out = '';
  let err = '';
  const calls: ExecCall[] = [];
  const asked: string[] = [];

  const io: DeployIO = {
    program: 'frogbot',
    cwd,
    env,
    isTTY,
    stdout: { write: (text: string) => (out += text) },
    stderr: { write: (text: string) => (err += text) },
    prompts: {
      confirm: (message) => {
        asked.push(message);

        if (confirm === undefined) throw new Error(`Unexpected prompt: ${message}`);

        return Promise.resolve(confirm);
      },
      select: (message) => Promise.reject(new Error(`Unexpected prompt: ${message}`)),
      multiselect: (message) => Promise.reject(new Error(`Unexpected prompt: ${message}`)),
    },
    openBrowser: () => undefined,
    wait: () => Promise.resolve(),
    loadConfig: typeof config === 'function' ? config : () => Promise.resolve(config),
    exec: (command, args, options) => {
      calls.push({ command, args, ...(options?.input !== undefined && { input: options.input }) });

      const program = programs[command];
      const result = program?.(args) ?? {};

      return Promise.resolve({ code: program ? 0 : 127, stdout: '', stderr: '', ...result });
    },
    which: (command) => Promise.resolve(Object.hasOwn(programs, command)),
  };

  const lines = (text: string) => text.split('\n').filter(Boolean);

  return {
    io,
    calls,
    asked,
    stdout: () => lines(out),
    stderr: () => lines(err),
    commands: () => calls.map((call) => [call.command, ...call.args].join(' ')),
  };
}

/** A target that records what it was given. */
export function recordingTarget(issues: { code: string; message: string; fix: string }[] = []) {
  const seen: { args: string[]; ran: boolean } = { args: [], ran: false };

  const target: DeployTarget = {
    describe: 'Test target',
    preflight: (context) => {
      seen.args = context.args;

      return issues;
    },
    run: async (context) => {
      seen.ran = true;
      await context.run('tool', ['ship', '--token', 'hunter2'], { mask: ['hunter2'] });
      await context.writeFile('out.txt', 'done');

      return { shipped: true };
    },
  };

  return { target, seen };
}
