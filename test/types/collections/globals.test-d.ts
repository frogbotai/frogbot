import type { DatabaseAdapter, FrogBotConfig } from 'frogbot';

declare const db: DatabaseAdapter;

export const config: FrogBotConfig = {
  collections: [],
  db,
  // @ts-expect-error `globals` is not a FrogBot config key.
  globals: [],
  secret: 'secret',
};
