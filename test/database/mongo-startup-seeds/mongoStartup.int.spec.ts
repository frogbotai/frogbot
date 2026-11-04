import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe.runIf(process.env.FROGBOT_DATABASE === 'mongodb')('mongodb startup', () => {
  let booted: BootedFrogBot;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname);
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  it('lets onInit write to a new versions collection on a fresh database', async () => {
    const { totalDocs } = await booted.frogbot.count({ collection: 'seeds', overrideAccess: true });

    expect(totalDocs).toBe(3);
  });
});
