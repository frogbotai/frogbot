import type { FrogBotInstance } from 'frogbot';
import { ensureAutonumbers, resetFrogBotCache } from 'frogbot/test';
import { expect, vi } from 'vitest';

import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import { countersSlug } from './shared.js';

export async function bootFresh<T>(boot: () => Promise<T>): Promise<T> {
  const forcePush = process.env.PAYLOAD_FORCE_DRIZZLE_PUSH;

  (globalThis as { _payload?: Map<string, unknown> })._payload?.delete('default');
  resetFrogBotCache();
  process.env.PAYLOAD_FORCE_DRIZZLE_PUSH = 'true';

  return boot().finally(() => {
    if (forcePush === undefined) delete process.env.PAYLOAD_FORCE_DRIZZLE_PUSH;
    else process.env.PAYLOAD_FORCE_DRIZZLE_PUSH = forcePush;
  });
}

export async function countCounters(frogbot: FrogBotInstance): Promise<number> {
  const { totalDocs } = await frogbot.db.count({ collection: countersSlug });

  return totalDocs;
}

export async function waitForStartupNumbering(frogbot: FrogBotInstance): Promise<void> {
  const fields = frogbot.config._internal.autonumbers.length;

  await vi.waitFor(async () => expect(await countCounters(frogbot)).toBe(fields), {
    timeout: 10_000,
  });
}

export async function clearAndNumber(frogbot: FrogBotInstance): Promise<void> {
  await clearAndSeed(frogbot, 'empty');
  await ensureAutonumbers(frogbot);
}
