import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getCurrentDatabaseAdapter } from '../__helpers/shared/db/dbAdapters.js';
import { createPostgresDatabase } from '../__helpers/shared/db/postgres.js';

const fixture = fileURLToPath(new URL('.', import.meta.url));
const executable = fileURLToPath(new URL('../../packages/frogbot/bin.js', import.meta.url));

type Result = { code: number | null; stdout: string; stderr: string };

function frogbot(args: string[], env: Record<string, string>): Promise<Result> {
  const base = { ...process.env };

  for (const name of ['NODE_OPTIONS', 'FROGBOT_CONFIG_PATH', 'PAYLOAD_DROP_DATABASE', 'ROOT_DIR']) {
    delete base[name];
  }

  const child = spawn(process.execPath, [executable, ...args], {
    cwd: fixture,
    env: { ...base, NODE_ENV: 'test', PAYLOAD_DISABLE_ADMIN: 'true', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));

  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function password(result: Result): string {
  const match = /^Password: (\S+)$/m.exec(result.stdout);

  if (!match?.[1]) throw new Error(`no password printed:\n${result.stdout}\n${result.stderr}`);

  return match[1];
}

async function login(env: Record<string, string>, email: string, secret: string, action = '') {
  const result = await frogbot(['run', 'login.mjs', email, secret, action], env);
  const line = /^RESULT (.+)$/m.exec(result.stdout)?.[1];

  expect(result.code, result.stdout + result.stderr).toBe(0);
  expect(line, result.stdout + result.stderr).toBeDefined();

  return JSON.parse(line ?? '') as { status: number; users: number; verified?: boolean };
}

let directory: string;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'frogbot-users-create-'));
});

afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

const sqlite = (name: string, scenario = 'plain') => ({
  USERS_CREATE_DATABASE_URL: `file:${join(directory, `${name}.db`)}`,
  USERS_CREATE_SCENARIO: scenario,
});

describe('frogbot users create on a local SQLite app', () => {
  it('creates the first user with a password printed once, and that password signs in', async () => {
    const env = sqlite('first');
    const result = await frogbot(['users', 'create', 'a@b.co'], env);

    expect(result.code, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain(
      `[frogbot] users create: database ${env.USERS_CREATE_DATABASE_URL}`,
    );
    expect(result.stdout).toContain('Created a@b.co in users.');

    const secret = password(result);

    expect(secret).toMatch(/^[\w-]{43}$/);
    expect(result.stdout.split(secret)).toHaveLength(2);
    expect(await login(env, 'a@b.co', secret)).toMatchObject({ status: 200, users: 1 });
  });

  it('refuses a second user, and still refuses once the first is trashed', async () => {
    const env = sqlite('second');
    const secret = password(await frogbot(['users', 'create', 'a@b.co'], env));

    const again = await frogbot(['users', 'create', 'b@b.co'], env);

    expect(again.code).toBe(1);
    expect(again.stderr).toContain(
      'the users collection already has users, so nothing was written',
    );
    expect(again.stdout).not.toContain('Password:');

    expect(await login(env, 'a@b.co', secret, 'trash')).toMatchObject({ users: 1 });

    const trashed = await frogbot(['users', 'create', 'b@b.co'], env);

    expect(trashed.code).toBe(1);
    expect(trashed.stderr).toContain('already has users');
    expect(await login(env, 'b@b.co', 'x')).toMatchObject({ users: 1 });
  });

  it('lets only one of two runs started together create a user', async () => {
    const env = sqlite('together');
    const runs = await Promise.all([
      frogbot(['users', 'create', 'a@b.co'], env),
      frogbot(['users', 'create', 'b@b.co'], env),
    ]);

    expect(runs.map(({ code }) => code).sort()).toEqual([0, 1]);
    expect(await login(env, 'x@b.co', 'x')).toMatchObject({ users: 1 });
  });

  it('names a missing required field, and creates the user once --set gives it', async () => {
    const env = sqlite('required', 'name');
    const missing = await frogbot(['users', 'create', 'a@b.co'], env);

    expect(missing.code).toBe(1);
    expect(missing.stderr).toMatch(/users create: users rejected the user: name \(/);
    expect(missing.stdout).not.toContain('Password:');

    const given = await frogbot(['users', 'create', 'a@b.co', '--set', 'name=Ada'], env);

    expect(given.code, given.stdout + given.stderr).toBe(0);
    expect(await login(env, 'a@b.co', password(given))).toMatchObject({ status: 200, users: 1 });
  });

  it('creates a verified user on a collection that verifies email, so it signs in at once', async () => {
    const env = sqlite('verify', 'verify');
    const result = await frogbot(['users', 'create', 'a@b.co'], env);

    expect(result.code, result.stdout + result.stderr).toBe(0);
    expect(result.stdout + result.stderr).not.toMatch(/verify your email|Email sent/i);
    expect(await login(env, 'a@b.co', password(result))).toMatchObject({ status: 200, users: 1 });
  });

  it('refuses a collection that has no auth', async () => {
    const result = await frogbot(
      ['users', 'create', 'a@b.co', '--collection', 'notes'],
      sqlite('notes'),
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('"notes" isn\'t an auth collection in this app.');
  });

  it('refuses a collection that signs in without a password, and prints none', async () => {
    const result = await frogbot(['users', 'create', 'a@b.co'], sqlite('no-local', 'no-local'));

    expect(result.code, result.stdout + result.stderr).toBe(1);
    expect(result.stdout).not.toContain('Password:');
    expect(result.stderr).toContain('"users" signs in without a password');
  });
});

describe('frogbot users reset-password on a local SQLite app', () => {
  it('prints a new password once that signs in, and the old one stops working', async () => {
    const env = sqlite('reset');
    const old = password(await frogbot(['users', 'create', 'a@b.co'], env));
    const result = await frogbot(['users', 'reset-password', 'A@B.co'], env);

    expect(result.code, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain(
      `[frogbot] users reset-password: database ${env.USERS_CREATE_DATABASE_URL}`,
    );
    expect(result.stdout).toContain('Reset the password of A@B.co in users.');

    const secret = password(result);

    expect(secret).toMatch(/^[\w-]{43}$/);
    expect(secret).not.toBe(old);
    expect(result.stdout.split(secret)).toHaveLength(2);
    expect(await login(env, 'a@b.co', secret)).toMatchObject({ status: 200, users: 1 });
    expect(await login(env, 'a@b.co', old)).toMatchObject({ status: 401 });
  });

  it('refuses an unknown email, and a trashed user, writing nothing', async () => {
    const env = sqlite('reset-unknown');
    const secret = password(await frogbot(['users', 'create', 'a@b.co'], env));
    const unknown = await frogbot(['users', 'reset-password', 'b@b.co'], env);

    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toContain(
      'users reset-password: no user in users has the email b@b.co, so nothing was written.',
    );
    expect(unknown.stdout).not.toContain('Password:');
    expect(await login(env, 'a@b.co', secret, 'trash')).toMatchObject({ users: 1 });

    const trashed = await frogbot(['users', 'reset-password', 'a@b.co'], env);

    expect(trashed.code).toBe(1);
    expect(trashed.stderr).toContain('no user in users has the email a@b.co');
  });

  it('clears a lockout from failed sign-ins', async () => {
    const env = sqlite('reset-lock', 'lock');
    const secret = password(await frogbot(['users', 'create', 'a@b.co'], env));

    await login(env, 'a@b.co', 'wrong');
    await login(env, 'a@b.co', 'wrong');

    expect((await login(env, 'a@b.co', secret)).status).not.toBe(200);

    const result = await frogbot(['users', 'reset-password', 'a@b.co'], env);

    expect(result.code, result.stdout + result.stderr).toBe(0);
    expect(await login(env, 'a@b.co', password(result))).toMatchObject({ status: 200, users: 1 });
  });

  it('marks an unverified user verified on a collection that verifies email', async () => {
    const env = sqlite('reset-verify', 'verify');
    const secret = password(await frogbot(['users', 'create', 'a@b.co'], env));

    expect((await login(env, 'a@b.co', secret, 'unverify')).status).not.toBe(200);

    const result = await frogbot(['users', 'reset-password', 'a@b.co'], env);

    expect(result.code, result.stdout + result.stderr).toBe(0);
    expect(result.stdout + result.stderr).not.toMatch(/Email sent/i);
    expect(await login(env, 'a@b.co', password(result))).toMatchObject({ status: 200, users: 1 });
  });

  it('leaves an unverified user unverified when the reset fails', async () => {
    const env = sqlite('reset-blocked', 'verify');
    const secret = password(await frogbot(['users', 'create', 'a@b.co'], env));

    await login(env, 'a@b.co', secret, 'unverify');

    const blocked = { ...env, USERS_CREATE_SCENARIO: 'verify-block' };
    const result = await frogbot(['users', 'reset-password', 'a@b.co'], blocked);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('users rejected the new password: account disabled');
    expect(result.stdout).not.toContain('Password:');
    expect(await login(env, 'a@b.co', secret)).toMatchObject({ verified: false });
  });

  it('resets a user saved before a field became required', async () => {
    const env = sqlite('reset-required');

    await frogbot(['users', 'create', 'a@b.co'], env);

    const required = { ...env, USERS_CREATE_SCENARIO: 'name' };
    const result = await frogbot(['users', 'reset-password', 'a@b.co'], required);

    expect(result.code, result.stdout + result.stderr).toBe(0);
    expect(await login(required, 'a@b.co', password(result))).toMatchObject({ status: 200 });
  });
});

describe('frogbot users create on a Postgres database', () => {
  it('names host and database without credentials, and writes nothing without --yes', async () => {
    const env = {
      USERS_CREATE_DATABASE_URL: 'postgres://admin:hunter2@db.invalid:5432/app',
      USERS_CREATE_SCENARIO: 'plain',
    };

    const result = await frogbot(['users', 'create', 'a@b.co'], env);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain(
      '[frogbot] users create: database postgres://db.invalid:5432/app',
    );
    expect(result.stderr).toContain('Run again with --yes');
    expect(result.stdout + result.stderr).not.toContain('hunter2');
  });

  describe.runIf(getCurrentDatabaseAdapter() === 'postgres')('with the Postgres service', () => {
    let database: Awaited<ReturnType<typeof createPostgresDatabase>> | undefined;
    let raced: Awaited<ReturnType<typeof createPostgresDatabase>> | undefined;

    beforeAll(async () => {
      database = await createPostgresDatabase('users_create');
      raced = await createPostgresDatabase('users_create_race');
    });

    afterAll(async () => {
      await database?.drop();
      await raced?.drop();
    });

    it('creates the user with --yes', async () => {
      const url = database!.url;
      const env = { USERS_CREATE_DATABASE_URL: url.toString(), USERS_CREATE_SCENARIO: 'plain' };

      const result = await frogbot(['users', 'create', 'a@b.co', '--yes'], env);

      expect(result.code, result.stdout + result.stderr).toBe(0);
      expect(result.stdout).toContain(
        `[frogbot] users create: database postgres://${url.host}${url.pathname}\n`,
      );
      expect(await login(env, 'a@b.co', password(result))).toMatchObject({ status: 200, users: 1 });
    });

    it('lets only one of two runs started together create a user', async () => {
      const env = {
        USERS_CREATE_DATABASE_URL: raced!.url.toString(),
        USERS_CREATE_SCENARIO: 'plain',
      };

      const runs = await Promise.all([
        frogbot(['users', 'create', 'b@b.co', '--yes'], env),
        frogbot(['users', 'create', 'c@b.co', '--yes'], env),
      ]);

      expect(runs.map(({ code }) => code).sort()).toEqual([0, 1]);
      expect(await login(env, 'x@b.co', 'x')).toMatchObject({ users: 1 });
    });
  });
});
