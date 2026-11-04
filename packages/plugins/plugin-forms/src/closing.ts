import { type FrogBot, KVLockContentionError } from 'frogbot';

import type { FormDocument } from './types.js';

const LOCK_TTL = 30_000;
const LOCK_ATTEMPTS = 100;

export function countKey(form: Pick<FormDocument, 'id'>): string {
  return `plugin-forms:count:${form.id}`;
}

export async function readCount(frogbot: FrogBot, form: Pick<FormDocument, 'id'>): Promise<number> {
  const stored = await frogbot.kv.get(countKey(form));

  return typeof stored === 'number' ? stored : 0;
}

/** True when the form takes no more responses: closed, past `closesAt`, or at `maxResponses`. */
export function isClosed(form: FormDocument, count: number, now = new Date()): boolean {
  if (form.status === 'closed') return true;
  if (form.closesAt && new Date(form.closesAt) <= now) return true;

  return typeof form.maxResponses === 'number' && count >= form.maxResponses;
}

export async function formIsClosed(frogbot: FrogBot, form: FormDocument): Promise<boolean> {
  return isClosed(form, typeof form.maxResponses === 'number' ? await readCount(frogbot, form) : 0);
}

/** Runs `fn` under a KV lock, retrying for about 5 seconds while another request holds it. */
export async function withLock<T>(frogbot: FrogBot, key: string, fn: () => Promise<T>) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await frogbot.kv.lock(key, LOCK_TTL, fn);
    } catch (error) {
      if (!(error instanceof KVLockContentionError) || attempt >= LOCK_ATTEMPTS) throw error;

      await new Promise((resolve) => setTimeout(resolve, 25 + Math.random() * 50));
    }
  }
}

/**
 * Runs `create` and counts the response. With `maxResponses` set, the count is checked and
 * raised under a per-form lock, so concurrent submits never pass the limit; returns `closed`
 * when the limit is already reached.
 */
export async function countResponse<T>(
  frogbot: FrogBot,
  form: FormDocument,
  create: () => Promise<T>,
): Promise<{ closed: true } | { closed: false; result: T }> {
  const run = async () => {
    const count = await readCount(frogbot, form);

    if (isClosed(form, count)) return { closed: true as const };

    const result = await create();

    await frogbot.kv.set(countKey(form), count + 1);

    return { closed: false as const, result };
  };

  return typeof form.maxResponses === 'number'
    ? withLock(frogbot, `plugin-forms:form:${form.id}`, run)
    : run();
}
