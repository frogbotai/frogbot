import { setTimeout } from 'node:timers/promises';

import { type FrogBotRequest, KVLockContentionError } from 'frogbot';

import { TEN_MINUTES } from './context.js';

const MAX_FAILURES = 5;

type Failures = { count: number; until: number };

const lockKey = (slug: string, id: string | number) =>
  `two-factor:lock:${JSON.stringify([slug, id])}`;

const failuresKey = (slug: string, id: string | number) =>
  `two-factor:failures:${JSON.stringify([slug, id])}`;

/** Runs `fn` while holding the user's code lock, so two requests can't both accept one code. */
export async function withCodeLock<T>({
  req,
  slug,
  id,
  fn,
}: {
  req: FrogBotRequest;
  slug: string;
  id: string | number;
  fn: () => Promise<T>;
}): Promise<T> {
  const deadline = Date.now() + 5_000;

  for (;;) {
    try {
      return await req.frogbot.kv.lock(lockKey(slug, id), 30_000, fn);
    } catch (error) {
      if (!(error instanceof KVLockContentionError) || Date.now() >= deadline) throw error;

      await setTimeout(50);
    }
  }
}

async function readFailures(req: FrogBotRequest, key: string): Promise<Failures | null> {
  const stored = (await req.frogbot.kv.get(key)) as Failures | null;

  return stored && stored.until > Date.now() ? stored : null;
}

/** True when five wrong codes in ten minutes locked the user's code entry. */
export async function isCodeLocked(
  req: FrogBotRequest,
  slug: string,
  id: string | number,
): Promise<boolean> {
  return ((await readFailures(req, failuresKey(slug, id)))?.count ?? 0) >= MAX_FAILURES;
}

/** Counts a wrong code. The fifth in ten minutes locks code entry for ten minutes. */
export async function recordCodeFailure(
  req: FrogBotRequest,
  slug: string,
  id: string | number,
): Promise<void> {
  const key = failuresKey(slug, id);
  const now = Date.now();
  const previous = await readFailures(req, key);
  const count = (previous?.count ?? 0) + 1;
  const until = count >= MAX_FAILURES ? now + TEN_MINUTES : (previous?.until ?? now + TEN_MINUTES);

  await req.frogbot.kv.set(key, { count, until }, { ttl: until - now });
}

export async function clearCodeFailures(
  req: FrogBotRequest,
  slug: string,
  id: string | number,
): Promise<void> {
  await req.frogbot.kv.delete(failuresKey(slug, id));
}
