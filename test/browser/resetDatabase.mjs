// Gives a browser fixture's server an empty SQLite database before it starts, like Payload's
// PAYLOAD_DROP_DATABASE: deletes the database and its journal files, then copies in the schema
// database that the production build created, if one is given, with its WAL files: SQLite runs in
// WAL mode by default, so the build's tables can still be in `schema.db-wal`. A dev server pushes its own
// schema on start. Runs only when Playwright starts the server itself, never for a reused one.
import { copyFileSync, existsSync, rmSync } from 'node:fs';

const [database, schema] = process.argv.slice(2);

for (const suffix of ['', '-journal', '-shm', '-wal']) {
  rmSync(database + suffix, { force: true });
}

if (schema) {
  for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(schema + suffix)) copyFileSync(schema + suffix, database + suffix);
  }
}
