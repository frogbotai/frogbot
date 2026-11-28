import { afterEach, describe, expect, it, vi } from 'vitest';

import { sqliteAdapter } from '../../../../packages/db-sqlite/src/index.js';
import {
  describeDatabase,
  parseUsersArgs,
  users,
} from '../../../../packages/frogbot/src/bin/users.js';
import type { FrogBotSanitizedConfig } from '../../../../packages/frogbot/src/config/sanitized.js';

describe('parseUsersArgs', () => {
  it('reads the email, collection, repeated --set pairs and --yes', () => {
    expect(
      parseUsersArgs([
        'create',
        'a@b.co',
        '--collection',
        'admins',
        '--set',
        'name=Ada',
        '--set',
        'note=a=b',
        '--yes',
      ]),
    ).toEqual({
      command: 'create',
      email: 'a@b.co',
      collection: 'admins',
      data: { name: 'Ada', note: 'a=b' },
      yes: true,
    });
  });

  it('reads reset-password with its email, collection and --yes', () => {
    expect(parseUsersArgs(['reset-password', 'a@b.co', '--collection', 'admins', '--yes'])).toEqual(
      { command: 'reset-password', email: 'a@b.co', collection: 'admins', yes: true },
    );
  });

  it.each([
    [[], 'the users commands are `create` and `reset-password`.'],
    [['list'], 'the users commands are `create` and `reset-password`.'],
    [['reset-password'], 'give the email of the user whose password to reset.'],
    [['reset-password', 'a@b.co', 'b@c.co'], 'unexpected argument "b@c.co".'],
    [['reset-password', 'a@b.co', '--set', 'name=x'], "reset-password doesn't take --set."],
    [['reset-password', 'a@b.co', '--password', 'x'], "Unknown option '--password'"],
    [['create'], 'give the email of the user to create.'],
    [['create', 'a@b.co', 'b@c.co'], 'unexpected argument "b@c.co".'],
    [['create', 'a@b.co', '--set', 'name'], '--set takes <field>=<value>, not "name".'],
    [['create', 'a@b.co', '--set', 'password=x'], "--set can't set password."],
    [['create', 'a@b.co', '--set', 'email=x'], "--set can't set email."],
    [['create', 'a@b.co', '--password', 'x'], "Unknown option '--password'"],
  ])('rejects %j', (args, message) => {
    expect(() => parseUsersArgs(args)).toThrow(message);
  });
});

describe('describeDatabase', () => {
  it.each([
    ['file:./frogbot.db', { local: true, label: 'file:./frogbot.db' }],
    [':memory:', { local: true, label: ':memory:' }],
    [
      'postgres://admin:hunter2@db.example.com:5432/app?sslmode=require&password=x',
      { local: false, label: 'postgres://db.example.com:5432/app' },
    ],
    [
      'libsql://app-org.turso.io?authToken=secret',
      { local: false, label: 'libsql://app-org.turso.io' },
    ],
    [
      'mongodb+srv://u:p@cluster0.example.net/app',
      { local: false, label: 'mongodb+srv://cluster0.example.net/app' },
    ],
    [
      'mongodb://app:s3cret@db1.example.com:27017,db2.example.com:27017/app?replicaSet=rs0',
      { local: false, label: 'mongodb://db1.example.com:27017/app' },
    ],
    [
      'postgres://admin:2024/Spring@db.example.com/app',
      { local: false, label: 'postgres://db.example.com/app' },
    ],
    [
      'postgres://admin:4821?Kx@db.example.com/app',
      { local: false, label: 'postgres://db.example.com/app' },
    ],
    [
      'postgres://db.example.com/app?password=sec@ret',
      { local: false, label: 'postgres://db.example.com/app' },
    ],
    [
      'postgres://admin:2024/Spring@db.example.com/app?password=sec@ret',
      { local: false, label: 'postgres://db.example.com/app' },
    ],
    [
      'mongodb://app:s3cret@db1.example.com:27017,db2.example.com:27017/app?authMechanismProperties=x@y',
      { local: false, label: 'mongodb://db1.example.com:27017/app' },
    ],
    [
      'postgres://db.example.com/app?sslcert=/home/a@b/c',
      { local: false, label: 'postgres://db.example.com/app' },
    ],
    [
      'postgres://admin:9911#Kx@db.example.com:5432/app',
      { local: false, label: 'postgres://db.example.com:5432/app' },
    ],
    ['not a url', { local: false, label: 'a database URL that could not be read' }],
    [undefined, { local: false, label: "the adapter's database (it doesn't say where)" }],
  ])('names %s without credentials', (url, expected) => {
    expect(describeDatabase(url)).toEqual(expected);
  });

  it('counts an embedded replica as remote, and names the remote it syncs to', () => {
    expect(
      describeDatabase('file:./replica.db', 'libsql://prod-org.turso.io?authToken=turso-secret'),
    ).toEqual({
      local: false,
      label: 'file:./replica.db, a replica of libsql://prod-org.turso.io',
    });
  });
});

describe('users', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function app(db: string | object | undefined): FrogBotSanitizedConfig {
    const payloadConfig = {
      admin: { user: 'users' },
      collections: [
        { slug: 'users', auth: {} },
        { slug: 'posts', auth: false },
        { slug: 'sso', auth: { disableLocalStrategy: { enableFields: true } } },
      ],
      db: typeof db === 'object' ? db : { url: db },
    };

    return { _internal: { payloadConfig: Promise.resolve(payloadConfig) } } as never;
  }

  it('throws a usage error, exiting 2, with the usage for bad arguments', async () => {
    await expect(users(['create'], {})).rejects.toMatchObject({
      exitCode: 2,
      code: 'USAGE_ERROR',
      message: [
        'users: give the email of the user to create.',
        '[frogbot] usage: frogbot users create <email> [--collection <slug>] [--set <field>=<value>]... [--yes] [--json]',
        '                 frogbot users reset-password <email> [--collection <slug>] [--yes] [--json]',
      ].join('\n'),
    });
  });

  it('refuses a collection without auth before touching the database', async () => {
    await expect(
      users(['create', 'a@b.co', '--collection', 'posts'], { config: app('file:./x.db') }),
    ).rejects.toMatchObject({
      exitCode: 1,
      code: 'NOT_AUTH_COLLECTION',
      message: '[frogbot] users create: "posts" isn\'t an auth collection in this app.',
    });
  });

  it('refuses a collection that signs in without a password, and prints none', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(
      users(['create', 'a@b.co', '--collection', 'sso'], { config: app('file:./x.db') }),
    ).rejects.toThrow('"sso" signs in without a password');

    expect(log.mock.calls.flat().join('\n')).not.toContain('Password:');
  });

  it('asks for --yes on an embedded replica that syncs to a remote libsql database', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const db = sqliteAdapter({
      client: {
        url: 'file:./replica.db',
        syncUrl: 'libsql://prod-org.turso.io',
        authToken: 'turso-secret-token',
      },
    });

    const failure = await users(['create', 'a@b.co'], { config: app(db) }).catch((e: Error) => e);

    expect(log.mock.calls.flat()).toEqual([
      '[frogbot] users create: database file:./replica.db, a replica of libsql://prod-org.turso.io',
    ]);
    expect(failure).toMatchObject({ code: 'CONFIRM_REQUIRED', exitCode: 1 });
    expect(String(failure)).toContain('Run again with --yes');
    expect([...log.mock.calls.flat(), String(failure)].join('\n')).not.toContain(
      'turso-secret-token',
    );
  });

  it('names a remote database and writes nothing without --yes', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const failure = await users(['create', 'a@b.co'], {
      config: app('postgres://u:secret@db.host/app'),
    }).catch((e: Error) => e);

    expect(log.mock.calls.flat()).toEqual([
      '[frogbot] users create: database postgres://db.host/app',
    ]);
    expect(String(failure)).toContain('Run again with --yes');
    expect([...log.mock.calls.flat(), String(failure)].join('\n')).not.toContain('secret');
  });

  it('refuses to reset a password on a collection that signs in without one', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(
      users(['reset-password', 'a@b.co', '--collection', 'sso'], { config: app('file:./x.db') }),
    ).rejects.toMatchObject({
      code: 'NO_PASSWORD_LOGIN',
      message:
        '[frogbot] users reset-password: "sso" signs in without a password (disableLocalStrategy), so there is no password to reset. Sign in with its provider instead.',
    });
    expect(log.mock.calls.flat().join('\n')).not.toContain('Password:');
  });

  it('names a remote database and resets nothing without --yes', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const failure = await users(['reset-password', 'a@b.co'], {
      config: app('postgres://u:secret@db.host/app'),
    }).catch((e: Error) => e);

    expect(log.mock.calls.flat()).toEqual([
      '[frogbot] users reset-password: database postgres://db.host/app',
    ]);
    expect(failure).toMatchObject({ code: 'CONFIRM_REQUIRED', exitCode: 1 });
    expect(String(failure)).toContain('the database to change the password in');
  });
});
