import { setTimeout } from 'node:timers/promises';

import type { KV, KVLockCallback } from '../kv/types.js';

export async function runChannelLock<T>({
  kv,
  key,
  signal,
  run,
}: {
  kv: KV;
  key: string;
  signal: AbortSignal;
  run: KVLockCallback<T>;
}): Promise<T> {
  while (true) {
    signal.throwIfAborted();

    let work: Promise<T> | undefined;

    try {
      return await kv.lock(key, 30_000, ({ signal: leaseSignal }) => {
        const turnSignal = AbortSignal.any([signal, leaseSignal]);

        work = Promise.resolve().then(() => {
          turnSignal.throwIfAborted();

          return run({ signal: turnSignal });
        });

        return work;
      });
    } catch (error) {
      if (work || !(error instanceof Error) || error.name !== 'KVLockContentionError') {
        throw error;
      }

      await setTimeout(100, undefined, { signal });
    } finally {
      await work;
    }
  }
}
