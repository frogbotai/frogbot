import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bootFrogBot } from '../../__helpers/shared/bootFrogBot';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe.runIf(process.env.FROGBOT_DATABASE === 'mongodb')('mongodb startup', () => {
  const dropDatabase = process.env.PAYLOAD_DROP_DATABASE;

  beforeAll(() => {
    process.env.PAYLOAD_DROP_DATABASE = 'false';
  });

  afterAll(() => {
    process.env.PAYLOAD_DROP_DATABASE = dropDatabase;
  });

  it('fails startup with the collection slug when an index cannot be built', async () => {
    await expect(bootFrogBot(dirname)).rejects.toThrow(
      'Could not create the collection or indexes for "dupes"',
    );
  });
});
