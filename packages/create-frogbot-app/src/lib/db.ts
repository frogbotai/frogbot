import { createHash } from 'node:crypto';

import type { Database } from '../types.js';
import { type ConfigFile, setImport, setProperty } from './config.js';

function mongoDatabaseName(name: string): string {
  if (/^[a-z0-9_-]{1,63}$/.test(name)) return name;

  const prefix = name.replace(/[^a-z0-9_-]/g, '-').slice(0, 54);
  const suffix = createHash('sha256').update(name).digest('hex').slice(0, 8);

  return `${prefix}-${suffix}`;
}

const DATABASES: Record<
  Database,
  { adapter: string; db: string; package: string; url: (name: string) => string }
> = {
  sqlite: {
    adapter: 'sqliteAdapter',
    db: "sqliteAdapter({\n  client: { url: process.env.DATABASE_URL || '' },\n})",
    package: '@frogbotai/db-sqlite',
    url: () => 'file:./frogbot.db',
  },
  postgres: {
    adapter: 'postgresAdapter',
    db: "postgresAdapter({\n  pool: { connectionString: process.env.DATABASE_URL || '' },\n})",
    package: '@frogbotai/db-postgres',
    url: (name) => `postgres://postgres:postgres@127.0.0.1:5432/${name}`,
  },
  mongodb: {
    adapter: 'mongooseAdapter',
    db: "mongooseAdapter({\n  url: process.env.DATABASE_URL || '',\n})",
    package: '@frogbotai/db-mongodb',
    url: (name) => `mongodb://127.0.0.1:27017/${mongoDatabaseName(name)}`,
  },
};

export const DATABASE_CHOICES = Object.keys(DATABASES) as Database[];

export function applyDatabase(config: ConfigFile, database: Database): void {
  const chosen = DATABASES[database];

  setProperty(config.object, 'db', chosen.db);

  setImport(
    config.file,
    chosen.adapter,
    chosen.package,
    Object.values(DATABASES).map((entry) => entry.package),
  );
}

export function databaseUrl(database: Database, projectName: string): string {
  return DATABASES[database].url(projectName);
}
