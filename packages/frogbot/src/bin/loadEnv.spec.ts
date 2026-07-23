import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('loadEnv', () => {
  it('does not overwrite an existing environment variable', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'frogbot-env-'));
    const original = process.env.FROGBOT_TEST_KEY;

    await writeFile(join(dir, '.env'), 'FROGBOT_TEST_KEY=from-file\n');
    process.env.FROGBOT_TEST_KEY = 'from-process';

    try {
      const { loadEnv } = await import('./loadEnv.js');
      loadEnv(dir);
      expect(process.env.FROGBOT_TEST_KEY).toBe('from-process');
    } finally {
      if (original === undefined) delete process.env.FROGBOT_TEST_KEY;
      else process.env.FROGBOT_TEST_KEY = original;
      await rm(dir, { recursive: true, force: true });
    }
  });
});
