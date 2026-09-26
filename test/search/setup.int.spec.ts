import { describe, expect, it } from 'vitest';

import { sanitize } from '../../packages/frogbot/src/config/sanitize.js';
import type { FrogBotConfig } from '../../packages/frogbot/src/config/types.js';
import { FrogBot } from '../../packages/frogbot/src/frogbot.js';

const { databaseAdapter } = await import('../databaseAdapter.js');

const implemented = ['mongodb', 'postgres', 'sqlite'].includes(
  process.env.FROGBOT_DATABASE || 'sqlite',
);

function searchConfig() {
  return sanitize({
    secret: 'search-test',
    db: databaseAdapter,
    typescript: { autoGenerate: false },
    collections: [
      {
        slug: 'search-articles',
        fields: [{ name: 'title', type: 'text' }],
        search: { titles: { lexical: { fields: ['title'] } } },
      },
    ],
  } as FrogBotConfig);
}

describe('search setup', () => {
  it.skipIf(implemented)(
    'rejects an unimplemented search index at database initialization',
    async () => {
      await expect(new FrogBot().init({ config: searchConfig() })).rejects.toThrow(
        /titles.*search-articles.*lexical.*not-implemented/,
      );
    },
  );

  it.skipIf(implemented)(
    'rejects an unimplemented search index when initializing without a database connection',
    async () => {
      await expect(
        new FrogBot().init({ config: searchConfig(), disableDBConnect: true }),
      ).rejects.toThrow(/titles.*search-articles.*lexical.*not-implemented/);
    },
  );

  it.runIf(implemented)(
    'initializes a supported search index without a database connection',
    async () => {
      await expect(
        new FrogBot().init({ config: searchConfig(), disableDBConnect: true }),
      ).resolves.toBeInstanceOf(FrogBot);
    },
  );
});
