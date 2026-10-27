import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { alive } from '../scripts/lib/slot.mjs';

export const SQLITE_DIR = path.join(os.tmpdir(), 'frogbot-int-db');

export function prepareSqliteDatabase({
  dir = SQLITE_DIR,
  env = process.env,
  pid = process.pid,
}: { dir?: string; env?: Record<string, string | undefined>; pid?: number } = {}): () => void {
  mkdirSync(dir, { recursive: true });

  for (const name of readdirSync(dir)) {
    if (!alive(Number(name))) rmSync(path.join(dir, name), { recursive: true, force: true });
  }

  if (env.SQLITE_URL || env.DATABASE_URL) return () => {};

  const runDir = path.join(dir, String(pid));

  mkdirSync(runDir, { recursive: true });
  env.SQLITE_URL = `file:${path.join(runDir, 'test.db')}`;

  return () => {
    rmSync(runDir, { recursive: true, force: true });
    delete env.SQLITE_URL;
  };
}

export default function setup() {
  return prepareSqliteDatabase();
}
