import { setTimeout } from 'node:timers/promises';

import type { DojoClient } from './dojo.js';
import { createDojo, dojoMessage, segment } from './dojo.js';
import { ShareError } from './error.js';
import type { DojoIO } from './io.js';
import { done, say } from './io.js';

const usage = (program: string) => `Usage: ${program} apps logs <app> [--follow]`;

const pollMs = 2000;

type LogsReply = { lines: { at: string; message: string }[]; next: string | null };

/** How `--follow` waits between polls and when it stops; tests drive both. */
export type LogsFollow = { wait?: (ms: number) => Promise<unknown>; signal?: AbortSignal };

/** Runs `frogbot dojo apps logs <app> [--follow]` and returns its exit code; known stops print one `[frogbot]` line. */
export async function runLogs(
  args: string[],
  io: DojoIO,
  follow: LogsFollow = {},
): Promise<number> {
  try {
    return await logs(args, io, follow);
  } catch (error) {
    if (!(error instanceof ShareError)) throw error;

    io.stderr.write(`[frogbot] ${error.message}\n`);

    return error.code;
  }
}

async function logs(
  args: string[],
  io: DojoIO,
  { wait = setTimeout, signal }: LogsFollow,
): Promise<number> {
  const following = args.includes('--follow');
  const rest = args.filter((arg) => arg !== '--follow');
  const [app] = rest;

  if (rest.length !== 1 || !app || app.startsWith('-') || args.length - rest.length > 1) {
    throw new ShareError(usage(io.program), 2);
  }

  if (following && io.json) {
    throw new ShareError(
      `--follow keeps printing, so it can't end in one JSON value. ${usage(io.program)}`,
      2,
    );
  }

  const dojo = createDojo(io);

  await dojo.signIn();

  const first = await read(dojo, app, null);

  if (io.json) {
    done(io, first);

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

async function read(dojo: DojoClient, app: string, after: string | null): Promise<LogsReply> {
  const query = after ? `?after=${encodeURIComponent(after)}` : '';
  const response = await dojo.request(`/api/apps/${segment(app)}/logs${query}`);

  if (!response.ok) throw new ShareError(await dojoMessage(response));

  const reply = (await response.json()) as Partial<LogsReply>;

  if (!Array.isArray(reply.lines)) {
    throw new ShareError("Couldn't read the logs: Dojo sent no lines.");
  }

  return { lines: reply.lines, next: reply.next ?? null };
}

function print(io: DojoIO, reply: LogsReply): void {
  for (const { at, message } of reply.lines) say(io, `${at} ${message}`);
}
