// Deletes a browser fixture's SQLite database (and its journal files) so the
// dev server starts from an empty schema, like Payload's PAYLOAD_DROP_DATABASE.
// Runs only when Playwright starts the server itself, never for a reused one.
import { rmSync } from 'node:fs';

for (const file of process.argv.slice(2)) {
  for (const suffix of ['', '-journal', '-shm', '-wal']) {
    rmSync(file + suffix, { force: true });
  }
}
