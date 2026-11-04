import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { bootFrogBot } from '../../__helpers/shared/bootFrogBot';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe.runIf(process.env.FROGBOT_DATABASE === 'mongodb')('mongodb startup', () => {
  it('fails startup with the collection slug when an index cannot be built', async () => {
    await expect(bootFrogBot(dirname)).rejects.toThrow(/dupes/);
  });
});
