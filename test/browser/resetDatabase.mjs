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
