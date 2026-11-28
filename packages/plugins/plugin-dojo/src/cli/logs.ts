import { setTimeout } from 'node:timers/promises';

import { linkedApp } from './command.js';
import type { DojoClient } from './dojo.js';
import { createDojo, dojoJSON, segment } from './dojo.js';
import { dojoStop, reportStop, ShareError } from './error.js';
import type { DojoIO } from './io.js';
import { done, say } from './io.js';
import { findApp, whereEquals } from './nouns/resolve.js';

const usage = (program: string, short?: boolean) =>
  `Usage: ${program} ${short ? 'logs' : 'apps logs'} [app] [--follow]`;

const pollMs = 2000;

type LogsReply = { lines: { at: string; message: string }[]; next: string | null };

/**
 * How `--follow` waits between polls and when it stops, which tests drive; `build` shows the last deploy's build log
 * instead when that deploy failed, as `frogbot dojo logs` does.
 */
export type LogsFollow = {
  wait?: (ms: number) => Promise<unknown>;
  signal?: AbortSignal;
  build?: boolean;
};

/**
 * Runs `frogbot dojo apps logs [app] [--follow]`, or `frogbot dojo logs`, and returns its exit code; `[app]` defaults
 * to the folder's. Known stops print one `[frogbot]` line.
 */
export async function runLogs(
  args: string[],
  io: DojoIO,
  follow: LogsFollow = {},
): Promise<number> {
  try {
    return await logs(args, io, follow);
  } catch (error) {
    return reportStop(io, error);
  }
}

async function logs(
  args: string[],
  io: DojoIO,
  { wait = setTimeout, signal, build = false }: LogsFollow,
): Promise<number> {
  const following = args.includes('--follow');
  const rest = args.filter((arg) => arg !== '--follow');
  const [named] = rest;

  if (
    rest.length > 1 ||
    named?.startsWith('-') ||
    named?.trim() === '' ||
    args.length - rest.length > 1
  ) {
    throw new ShareError(usage(io.program, build), 2);
  }

  if (following && io.json) {
    throw new ShareError(
      `--follow keeps printing, so it can't end in one JSON value. ${usage(io.program, build)}`,
      2,
    );
  }

  const app = named ?? (await linkedApp(io, usage(io.program, build)));
  const dojo = createDojo(io);

  await dojo.signIn();

  if (build && (await failedBuild(dojo, app, io))) return 0;

  const first = await read(dojo, app, null);

  if (io.json) {
    done(io, { source: 'runtime', ...first });

    return 0;
  }

  print(io, first);

  if (first.lines.length === 0) say(io, '[frogbot] No logs yet.');

  if (!following) return 0;

  let next = first.next;

  while (!signal?.aborted) {
    await wait(pollMs);

    if (signal?.aborted) break;

    const reply = await read(dojo, app, next);

    print(io, reply);
    next = reply.next;
  }

  return 0;
}

type LastDeploy = {
  id: string | number;
  status: string;
  runtimeStatus?: string | null;
  error?: string | null;
  runtimeError?: string | null;
  logTail?: unknown;
  runtimeLogTail?: unknown;
};

const tail = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);

async function failedBuild(dojo: DojoClient, ref: string, io: DojoIO): Promise<boolean> {
  const app = await findApp(dojo, ref);
  const {
    docs: [last],
  } = await dojoJSON<{ docs: LastDeploy[] }>(
    dojo,
    `/api/deployments?depth=0&limit=1&sort=-createdAt&${whereEquals('app', app.id)}&where[status][not_equals]=cancelled`,
    {
      what: `Couldn't read the deployments of ${app.slug}`,
      needs: 'editor or owner access to the app',
    },
  );

  const builtBad = last?.status === 'failed';

  if (!last || (!builtBad && last.runtimeStatus !== 'failed')) return false;

  const lines = builtBad ? tail(last.logTail) : tail(last.runtimeLogTail);
  const error = (builtBad ? last.error : last.runtimeError) ?? null;

  done(
    io,
    { source: builtBad ? 'build' : 'start', deploymentId: last.id, status: 'failed', error, lines },
    [
      ...lines,
      `[frogbot] The last deploy of ${app.slug} (${last.id}) failed ${builtBad ? 'to build' : 'to start'}${error ? `: ${error}` : ''}. These are its ${builtBad ? 'build' : 'start'} logs; frogbot deploy ships a fix.`,
    ],
  );

  return true;
}

async function read(dojo: DojoClient, app: string, after: string | null): Promise<LogsReply> {
  const query = after ? `?after=${encodeURIComponent(after)}` : '';
  const response = await dojo.request(`/api/apps/${segment(app)}/logs${query}`);

  if (!response.ok) throw await dojoStop(response);

  const reply = (await response.json()) as Partial<LogsReply>;

  if (!Array.isArray(reply.lines)) {
    throw new ShareError("Couldn't read the logs: Dojo sent no lines.");
  }

  return { lines: reply.lines, next: reply.next ?? null };
}

function print(io: DojoIO, reply: LogsReply): void {
  for (const { at, message } of reply.lines) say(io, `${at} ${message}`);
}
