import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';

import type { DojoClient } from '../dojo.js';
import { dojoMessage } from '../dojo.js';
import { ShareError } from '../error.js';
import type { ShareIO } from '../io.js';
import type { DataFile, DataInventory } from './inventory.js';

/** Where Dojo's `data-uploads` takes the snapshot; 301 moves it onto the volume before first start. */
export const snapshotKey = '.dojo/import/frogbot.db';

const concurrency = 4;
const batchBytes = 1_000_000;

type Reply =
  | { key: string; done: true }
  | { key: string; put: string }
  | { key: string; uploadId: string; partSize: number; parts: string[] };

type Upload = { key: string; uploadId: string; parts: { partNumber: number; etag: string }[] };

type Task = {
  object: DataFile;
  url: string;
  start: number;
  length: number;
  part?: { upload: Upload; partNumber: number; count: number; left: { count: number } };
};

export type UploadDataProps = {
  dojo: DojoClient;
  appId: string | number;
  inventory: Pick<DataInventory, 'snapshotPath' | 'files'>;
  io: Pick<ShareIO, 'stdout' | 'isTTY'>;
  /** Waits before each retry of a part; one entry per retry. */
  retryDelays?: number[];
};

/**
 * Sends the snapshot and every file straight to the app's bucket through the URLs Dojo signs
 * (300's `data-uploads`): one ranged stream per part, 4 at a time, each retried 3 times. Keys
 * Dojo already holds at the same size are skipped, so a rerun resumes.
 */
export async function uploadData({
  dojo,
  appId,
  inventory,
  io,
  retryDelays = [1_000, 2_000, 4_000],
}: UploadDataProps): Promise<void> {
  const objects: DataFile[] = [
    {
      key: snapshotKey,
      path: inventory.snapshotPath,
      size: (await stat(inventory.snapshotPath)).size,
    },
    ...inventory.files,
  ];

  const progress = uploadProgress(
    io,
    objects.reduce((sum, object) => sum + object.size, 0),
  );

  const base = `/api/apps/${appId}/data-uploads`;

  try {
    for (const batch of batches(objects)) {
      await uploadBatch({ dojo, base, batch, progress, retryDelays });
    }
  } finally {
    progress.end();
  }
}

async function uploadBatch({
  dojo,
  base,
  batch,
  progress,
  retryDelays,
}: {
  dojo: DojoClient;
  base: string;
  batch: DataFile[];
  progress: UploadProgress;
  retryDelays: number[];
}): Promise<void> {
  const response = await dojo.request(base, () => ({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ objects: batch.map(({ key, size }) => ({ key, size })) }),
  }));

  if (!response.ok) {
    throw new ShareError(`Couldn't start the data upload: ${await dojoMessage(response)}`);
  }

  const { objects: replies } = (await response.json()) as { objects: Reply[] };
  const byKey = new Map(replies.map((reply) => [reply.key, reply]));
  const tasks = batch.flatMap((object) => {
    const reply = byKey.get(object.key);

    if (!reply) throw new ShareError(`Dojo didn't answer for ${object.key}.`);

    return plan(object, reply, progress);
  });

  await runTasks(tasks, async (task, signal) => {
    const etag = await sendWithRetries(task, signal, retryDelays);

    progress.add(task.length);

    if (!task.part) return;

    const { upload, partNumber, left } = task.part;

    upload.parts.push({ partNumber, etag });
    left.count -= 1;

    if (left.count > 0) return;

    upload.parts.sort((a, b) => a.partNumber - b.partNumber);

    const completed = await dojo.request(`${base}/complete`, () => ({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ uploads: [upload] }),
      signal,
    }));

    if (!completed.ok) {
      throw new ShareError(
        `Couldn't finish uploading ${upload.key}: ${await dojoMessage(completed)}`,
      );
    }
  });
}

function batches(objects: DataFile[]): DataFile[][] {
  const all: DataFile[][] = [];
  let current: DataFile[] = [];
  let bytes = 0;

  for (const object of objects) {
    const size = Buffer.byteLength(object.key) + 32;

    if (current.length > 0 && bytes + size > batchBytes) {
      all.push(current);
      current = [];
      bytes = 0;
    }

    current.push(object);
    bytes += size;
  }

  if (current.length > 0) all.push(current);

  return all;
}

function plan(object: DataFile, reply: Reply, progress: UploadProgress): Task[] {
  if ('done' in reply) {
    progress.add(object.size);

    return [];
  }

  if ('put' in reply) return [{ object, url: reply.put, start: 0, length: object.size }];

  const { uploadId, partSize, parts } = reply;

  if (parts.length !== Math.ceil(object.size / partSize)) {
    throw new ShareError(`Dojo signed the wrong number of parts for ${object.key}.`);
  }

  const upload: Upload = { key: object.key, uploadId, parts: [] };
  const left = { count: parts.length };

  return parts.map((url, index) => {
    const start = index * partSize;

    return {
      object,
      url,
      start,
      length: Math.min(partSize, object.size - start),
      part: { upload, partNumber: index + 1, count: parts.length, left },
    };
  });
}

async function runTasks(
  tasks: Task[],
  run: (task: Task, signal: AbortSignal) => Promise<void>,
): Promise<void> {
  const controller = new AbortController();
  const queue = [...tasks];
  let failure: { error: unknown } | undefined;

  const worker = async () => {
    for (let task = queue.shift(); task && !failure; task = queue.shift()) {
      try {
        await run(task, controller.signal);
      } catch (error) {
        failure ??= { error };
        controller.abort();
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));

  if (failure) throw failure.error;
}

async function sendWithRetries(
  task: Task,
  signal: AbortSignal,
  retryDelays: number[],
): Promise<string> {
  const { object, part } = task;
  const what = part ? `${object.key} (part ${part.partNumber} of ${part.count})` : object.key;

  for (let attempt = 0; ; attempt++) {
    let reason: string;

    try {
      const response = await fetch(task.url, {
        method: 'PUT',
        headers: { 'content-length': String(task.length) },
        body:
          task.length === 0
            ? new Uint8Array()
            : (Readable.toWeb(
                createReadStream(object.path, {
                  start: task.start,
                  end: task.start + task.length - 1,
                }),
              ) as ReadableStream<Uint8Array>),
        duplex: 'half',
        signal,
      } as RequestInit & { duplex: 'half' });

      await response.body?.cancel();

      const etag = response.headers.get('etag');

      if (response.ok && (etag || !part)) return etag ?? '';

      reason = response.ok ? 'R2 sent no ETag' : `R2 answered ${response.status}`;
    } catch (error) {
      if (signal.aborted) throw error;

      reason = error instanceof Error ? error.message : String(error);
    }

    const delay = retryDelays[attempt];

    if (delay === undefined) {
      throw new ShareError(
        `Couldn't upload ${what}: ${reason}. Run share again to resume; finished files are skipped.`,
      );
    }

    await sleep(delay, undefined, { signal });
  }
}

type UploadProgress = { add: (bytes: number) => void; end: () => void };

function uploadProgress(io: UploadDataProps['io'], total: number): UploadProgress {
  let done = 0;
  let step = 0;
  const line = () => `[frogbot] Uploading data: ${formatBytes(done)} of ${formatBytes(total)}`;

  if (io.isTTY) io.stdout.write(line());

  return {
    add: (bytes) => {
      done += bytes;

      if (io.isTTY) {
        io.stdout.write(`\r${line()}\u001b[K`);

        return;
      }

      const reached = total === 0 ? 0 : Math.floor((done * 10) / total);

      if (reached > step) {
        step = reached;
        io.stdout.write(`${line()}\n`);
      }
    },
    end: () => {
      if (io.isTTY) io.stdout.write('\n');
    },
  };
}

/** `13.4 GB`, in powers of 1,000 like the archive summary. */
export function formatBytes(bytes: number): string {
  const units = ['KB', 'MB', 'GB', 'TB'];

  if (bytes < 1_000) return `${bytes} B`;

  let value = bytes / 1_000;
  let unit = 0;

  while (value >= 999.95 && unit < units.length - 1) {
    value /= 1_000;
    unit += 1;
  }

  return `${value.toFixed(1)} ${units[unit]}`;
}
