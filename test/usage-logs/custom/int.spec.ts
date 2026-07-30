import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { logUsage } from '../../../packages/frogbot/src/ai/logUsage.js';
import type { BootedFrogbot } from '../../__helpers/shared/bootFrogbot';
import { bootFrogbot } from '../../__helpers/shared/bootFrogbot';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('custom usage logs', () => {
  let booted: BootedFrogbot;

  beforeAll(async () => {
    booted = await bootFrogbot(dirname, 'usage-logs-custom');
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  it('writes usage to the marked custom collection only', async () => {
    expect(Object.keys(booted.frogbot.collections)).toContain('ai-usage');
    expect(Object.keys(booted.frogbot.collections)).not.toContain('usage-logs');

    logUsage({
      requestId: 'custom-write',
      model: 'zen/deepseek-v4-flash-free',
      operation: 'chat.completions',
      startedAt: Date.now(),
      context: { req: { frogbot: booted.frogbot } },
    } as never);

    await expect.poll(async () => {
      const result = await booted.frogbot.count({
        collection: 'ai-usage' as never,
        overrideAccess: true,
        where: { requestId: { equals: 'custom-write' } },
      });
      return result.totalDocs;
    }).toBe(1);
  });
});
