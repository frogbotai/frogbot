import { describe, expect, it } from 'vitest';

import { sanitize } from '../../packages/frogbot/src/config/sanitize.js';
import type { FrogBotConfig } from '../../packages/frogbot/src/config/types.js';
import { FrogBot } from '../../packages/frogbot/src/frogbot.js';

const { databaseAdapter } = await import('../databaseAdapter.js');

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
  it('rejects an unimplemented search index at database initialization', async () => {
    await expect(new FrogBot().init({ config: searchConfig() })).rejects.toThrow(
      /titles.*search-articles.*lexical.*not-implemented/,
    );
  });

  it('rejects an unimplemented search index when initializing without a database connection', async () => {
    await expect(
      new FrogBot().init({ config: searchConfig(), disableDBConnect: true }),
    ).rejects.toThrow(/titles.*search-articles.*lexical.*not-implemented/);
  });
});
