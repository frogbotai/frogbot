import { drizzle as libsql } from 'drizzle-orm/libsql';
import { drizzle as postgres } from 'drizzle-orm/node-postgres';
import { describe, expect, it } from 'vitest';

import {
  assertSQLiteSearchAdapter,
  getSearchDatabase,
} from '../../../../packages/frogbot/src/search/drizzle/sqlite/guards.js';

describe('assertSQLiteSearchAdapter', () => {
  it('passes a SQLite adapter through', () => {
    const adapter = { name: 'sqlite', packageName: '@frogbotai/db-sqlite' };

    expect(assertSQLiteSearchAdapter(adapter)).toBe(adapter);
  });

  it('names the expected and actual adapter when it is not SQLite', () => {
    expect(() =>
      assertSQLiteSearchAdapter({ name: 'postgres', packageName: '@frogbotai/db-postgres' }),
    ).toThrow(
      "[frogbot] Search requires a SQLite database adapter, but this app uses 'postgres' (@frogbotai/db-postgres).",
    );
  });
});

describe('getSearchDatabase', () => {
  it('passes a SQLite connection through', () => {
    const db = libsql.mock();

    expect(getSearchDatabase(db)).toBe(db);
  });

  it('rejects a connection of another dialect', () => {
    expect(() => getSearchDatabase(postgres.mock())).toThrow(
      '[frogbot] Search requires a SQLite database connection.',
    );
  });
});
