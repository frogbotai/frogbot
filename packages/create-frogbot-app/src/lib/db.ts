import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { Database } from '../types.js';
import { CONFIG_ANCHORS, replaceOnce } from './anchors.js';

function mongoDatabaseName(name: string): string {
  if (/^[a-z0-9_-]{1,63}$/.test(name)) return name;

  const prefix = name.replace(/[^a-z0-9_-]/g, '-').slice(0, 54);
  const suffix = createHash('sha256').update(name).digest('hex').slice(0, 8);

  return `${prefix}-${suffix}`;
}

const DATABASES: Record<
  Database,
  { block: string; import: string; url: (name: string) => string }
> = {
  sqlite: {
    block: CONFIG_ANCHORS.db,
    import: CONFIG_ANCHORS.dbImport,
    url: () => 'file:./frogbot.db',
  },
  postgres: {
    block:
      "  db: postgresAdapter({\n    pool: { connectionString: process.env.DATABASE_URL || '' },\n  }),\n",
    import: "import { postgresAdapter } from '@frogbotai/db-postgres';\n",
    url: (name) => `postgres://postgres:postgres@127.0.0.1:5432/${name}`,
  },
  mongodb: {
    block: "  db: mongooseAdapter({\n    url: process.env.DATABASE_URL || '',\n  }),\n",
    import: "import { mongooseAdapter } from '@frogbotai/db-mongodb';\n",
    url: (name) => `mongodb://127.0.0.1:27017/${mongoDatabaseName(name)}`,
  },
};

export function applyDatabase(dest: string, database: Database): void {
  const configPath = path.join(dest, 'src', 'frogbot.config.ts');
  let config = fs.readFileSync(configPath, 'utf8');

  config = replaceOnce(
    config,
    CONFIG_ANCHORS.dbImport,
    DATABASES[database].import,
    configPath,
    'dbImport',
  );
  config = replaceOnce(config, CONFIG_ANCHORS.db, DATABASES[database].block, configPath, 'db');

  fs.writeFileSync(configPath, config);
}

export function databaseUrl(database: Database, projectName: string): string {
  return DATABASES[database].url(projectName);
}
