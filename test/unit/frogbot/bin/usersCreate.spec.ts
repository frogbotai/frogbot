import { afterEach, describe, expect, it, vi } from 'vitest';

import { sqliteAdapter } from '../../../../packages/db-sqlite/src/index.js';
import {
  describeDatabase,
  parseUsersArgs,
  users,
} from '../../../../packages/frogbot/src/bin/usersCreate.js';
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
      email: 'a@b.co',
      collection: 'admins',
      data: { name: 'Ada', note: 'a=b' },
      yes: true,
    });
  });

  it.each([
    [[], 'the only users command is `create`.'],
    [['list'], 'the only users command is `create`.'],
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
      { local: false, label: 'a database URL that could not be read' },
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

  it('prints usage and returns 2 for bad arguments', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(users(['create'], {})).resolves.toBe(2);

    expect(error.mock.calls.flat()).toEqual([
      '[frogbot] users: give the email of the user to create.',
      '[frogbot] usage: frogbot users create <email> [--collection <slug>] [--set <field>=<value>]... [--yes]',
    ]);
  });

  it('refuses a collection without auth before touching the database', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      users(['create', 'a@b.co', '--collection', 'posts'], { config: app('file:./x.db') }),
    ).resolves.toBe(1);

    expect(error).toHaveBeenCalledWith(
      '[frogbot] users create: "posts" isn\'t an auth collection in this app.',
    );
  });

  it('refuses a collection that signs in without a password, and prints none', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      users(['create', 'a@b.co', '--collection', 'sso'], { config: app('file:./x.db') }),
    ).resolves.toBe(1);

    expect(log.mock.calls.flat().join('\n')).not.toContain('Password:');
    expect(error.mock.calls.flat().join('\n')).toContain('"sso" signs in without a password');
  });

  it('asks for --yes on an embedded replica that syncs to a remote libsql database', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const db = sqliteAdapter({
      client: {
        url: 'file:./replica.db',
        syncUrl: 'libsql://prod-org.turso.io',
        authToken: 'turso-secret-token',
      },
    });

    await expect(users(['create', 'a@b.co'], { config: app(db) })).resolves.toBe(1);

    expect(log.mock.calls.flat()).toEqual([
      '[frogbot] users create: database file:./replica.db, a replica of libsql://prod-org.turso.io',
    ]);
    expect(error.mock.calls.flat().join('\n')).toContain('Run again with --yes');
    expect([...log.mock.calls, ...error.mock.calls].flat().join('\n')).not.toContain(
      'turso-secret-token',
    );
  });

  it('names a remote database and writes nothing without --yes', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      users(['create', 'a@b.co'], { config: app('postgres://u:secret@db.host/app') }),
    ).resolves.toBe(1);

    expect(log.mock.calls.flat()).toEqual([
      '[frogbot] users create: database postgres://db.host/app',
    ]);
    expect(error.mock.calls.flat().join('\n')).toContain('Run again with --yes');
    expect([...log.mock.calls, ...error.mock.calls].flat().join('\n')).not.toContain('secret');
  });
});
