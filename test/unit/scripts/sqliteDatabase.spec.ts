import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prepareSqliteDatabase } from '../../sqliteDatabase.js';

let dir: string;

const deadPid = () => spawnSync(process.execPath, ['-e', '']).pid;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'frogbot-int-db-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('prepareSqliteDatabase', () => {
  it("points SQLITE_URL at a file in this run's folder and deletes the folder at the end", () => {
    const env: Record<string, string | undefined> = {};
    const teardown = prepareSqliteDatabase({ dir, env, pid: 4242 });

    expect(env.SQLITE_URL).toBe(`file:${path.join(dir, '4242', 'test.db')}`);
    expect(existsSync(path.join(dir, '4242'))).toBe(true);

    teardown();

    expect(existsSync(path.join(dir, '4242'))).toBe(false);
    expect(env.SQLITE_URL).toBeUndefined();
  });

  it('removes folders of dead runs and keeps folders of live ones', () => {
    const dead = String(deadPid());
    const live = String(process.pid);

    mkdirSync(path.join(dir, dead));
    mkdirSync(path.join(dir, live));

    prepareSqliteDatabase({ dir, env: {}, pid: 4242 });

    expect(existsSync(path.join(dir, dead))).toBe(false);
    expect(existsSync(path.join(dir, live))).toBe(true);
  });

  it.each(['SQLITE_URL', 'DATABASE_URL'])('uses a set %s as given', (name) => {
    const env: Record<string, string | undefined> = { [name]: 'file:./mine.db' };
    const teardown = prepareSqliteDatabase({ dir, env, pid: 4242 });

    teardown();

    expect(env).toEqual({ [name]: 'file:./mine.db' });
    expect(existsSync(path.join(dir, '4242'))).toBe(false);
  });
});
