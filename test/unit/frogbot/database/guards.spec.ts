import { describe, expect, it } from 'vitest';

import {
  assertDrizzleAdapter,
  assertPostgresAdapter,
  assertSQLiteAdapter,
} from '../../../../packages/frogbot/src/database/guards.js';

const postgres = { name: 'postgres', packageName: '@frogbotai/db-postgres' };
const sqlite = { name: 'sqlite', packageName: '@frogbotai/db-sqlite' };
const mongo = { name: 'mongoose', packageName: '@frogbotai/db-mongodb' };

describe('database adapter guards', () => {
  it.each([postgres, sqlite])('assertDrizzleAdapter passes the %o adapter through', (adapter) => {
    expect(assertDrizzleAdapter(adapter, 'Atomic updates')).toBe(adapter);
  });

  it('assertPostgresAdapter and assertSQLiteAdapter pass their own dialect through', () => {
    expect(assertPostgresAdapter(postgres, 'Search')).toBe(postgres);
    expect(assertSQLiteAdapter(sqlite, 'Search')).toBe(sqlite);
  });

  it.each([
    [
      () => assertDrizzleAdapter(mongo, 'Atomic updates'),
      "[frogbot] Atomic updates requires a Postgres or SQLite database adapter, but this app uses 'mongoose' (@frogbotai/db-mongodb).",
    ],
    [
      () => assertPostgresAdapter(sqlite, 'Search'),
      "[frogbot] Search requires a Postgres database adapter, but this app uses 'sqlite' (@frogbotai/db-sqlite).",
    ],
    [
      () => assertSQLiteAdapter({}, 'FrogBot SQL jobs'),
      "[frogbot] FrogBot SQL jobs requires a SQLite database adapter, but this app uses 'unnamed'.",
    ],
  ])('names the expected and actual adapter on a mismatch', (guard, message) => {
    expect(guard).toThrow(message);
  });
});
