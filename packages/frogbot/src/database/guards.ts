import type { DrizzleAdapter } from '@payloadcms/drizzle';
import type { BasePostgresAdapter } from '@payloadcms/drizzle/postgres';
import type { BaseSQLiteAdapter } from '@payloadcms/drizzle/sqlite';

export type PostgresAdapter = DrizzleAdapter & BasePostgresAdapter;

export type SQLiteAdapter = DrizzleAdapter & BaseSQLiteAdapter;

function describeAdapter(db: object): string {
  const name = 'name' in db && typeof db.name === 'string' ? db.name : 'unnamed';
  const pkg = 'packageName' in db && typeof db.packageName === 'string' ? db.packageName : '';

  return pkg ? `'${name}' (${pkg})` : `'${name}'`;
}

function named(db: object, ...names: string[]): boolean {
  return 'name' in db && typeof db.name === 'string' && names.includes(db.name);
}

function mismatch(feature: string, expected: string, db: object): Error {
  return new Error(
    `[frogbot] ${feature} requires ${expected} database adapter, but this app uses ${describeAdapter(db)}.`,
  );
}

function isDrizzleAdapter(db: object): db is DrizzleAdapter {
  return named(db, 'postgres', 'sqlite');
}

function isPostgresAdapter(db: object): db is PostgresAdapter {
  return named(db, 'postgres');
}

function isSQLiteAdapter(db: object): db is SQLiteAdapter {
  return named(db, 'sqlite');
}

export function assertDrizzleAdapter(db: object, feature: string): DrizzleAdapter {
  if (isDrizzleAdapter(db)) return db;

  throw mismatch(feature, 'a Postgres or SQLite', db);
}

export function assertPostgresAdapter(db: object, feature: string): PostgresAdapter {
  if (isPostgresAdapter(db)) return db;

  throw mismatch(feature, 'a Postgres', db);
}

export function assertSQLiteAdapter(db: object, feature: string): SQLiteAdapter {
  if (isSQLiteAdapter(db)) return db;

  throw mismatch(feature, 'a SQLite', db);
}
