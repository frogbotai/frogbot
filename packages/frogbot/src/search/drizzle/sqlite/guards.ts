import type { DrizzleAdapter, DrizzleTransaction } from '@payloadcms/drizzle';
import { is } from 'drizzle-orm';
import { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import { assertSQLiteAdapter } from '../../../database/guards.js';
import type { SearchDatabase, SQLiteSearchAdapter } from './types.js';

export function assertSQLiteSearchAdapter(db: object): SQLiteSearchAdapter {
  return assertSQLiteAdapter(db, 'Search');
}

export function getSearchDatabase(
  db: DrizzleAdapter['drizzle'] | DrizzleTransaction,
): SearchDatabase {
  if (is(db, BaseSQLiteDatabase)) return db;

  throw new Error('[frogbot] Search requires a SQLite database connection.');
}
