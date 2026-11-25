import { parseArgs } from 'node:util';

import { firstUser } from '../auth/firstUser.js';
import type { FrogBotSanitizedConfig } from '../config/sanitized.js';
import type { DatabaseAdapter } from '../database/types.js';
import type { FrogBot } from '../frogbot.js';
import { toPayloadRequest } from '../seams/request.js';
import { formatCliError } from './formatCliError.js';
import { CliError, usageError } from './json.js';

export const usersUsage =
  '[frogbot] usage: frogbot users create <email> [--collection <slug>] [--set <field>=<value>]... [--yes] [--json]';

export type UsersCreateOptions = {
  email: string;
  collection?: string;
  data: Record<string, string>;
  yes: boolean;
};

export type DatabaseLocation = { local: boolean; label: string };

type ValidationErrors = { data?: { errors?: { path?: string; message?: string }[] } };

/** Reads `users create`'s arguments, or throws a usage error (exit 2) naming what's wrong and the usage. */
export function parseUsersArgs(args: string[]): UsersCreateOptions {
  try {
    return readUsersArgs(args);
  } catch (error) {
    throw usageError(
      `users: ${error instanceof Error ? error.message : String(error)}\n${usersUsage}`,
    );
  }
}

function readUsersArgs(args: string[]): UsersCreateOptions {
  const parsed = parse(args);

  const [subcommand, email, ...extra] = parsed.positionals;

  if (subcommand !== 'create') throw new Error('the only users command is `create`.');
  if (!email) throw new Error('give the email of the user to create.');
  if (extra.length) throw new Error(`unexpected argument "${extra[0]}".`);

  const data: Record<string, string> = {};

  for (const pair of parsed.values.set ?? []) {
    const at = pair.indexOf('=');

    if (at < 1) throw new Error(`--set takes <field>=<value>, not "${pair}".`);

    data[pair.slice(0, at)] = pair.slice(at + 1);
  }

  for (const field of ['email', 'password']) {
    if (field in data) throw new Error(`--set can't set ${field}.`);
  }

  return { email, collection: parsed.values.collection, data, yes: parsed.values.yes ?? false };
}

function parse(args: string[]) {
  return parseArgs({
    args,
    allowPositionals: true,
    options: {
      collection: { type: 'string' },
      set: { type: 'string', multiple: true },
      yes: { type: 'boolean' },
    },
  });
}

const unreadable = { local: false, label: 'a database URL that could not be read' };

/**
 * Names a database URL without its credentials: a `file:` path as written, or `host/name` for a server.
 * Only a `file:` or `:memory:` SQLite URL with no `syncUrl` counts as local: an embedded replica writes
 * through to its remote.
 */
export function describeDatabase(url: string | undefined, syncUrl?: string): DatabaseLocation {
  if (!url) return { local: false, label: "the adapter's database (it doesn't say where)" };

  if (url.startsWith('file:') || url === ':memory:') {
    if (!syncUrl) return { local: true, label: url };

    return { local: false, label: `${url}, a replica of ${describeDatabase(syncUrl).label}` };
  }

  const scheme = /^[a-z][a-z\d+.-]*:\/\//i.exec(url)?.[0];

  if (!scheme) return unreadable;

  try {
    const { host, password, pathname, protocol, username } = new URL(url);

    if (!username && !password && url.includes('@')) {
      return describeMultiHost(scheme, url.slice(scheme.length));
    }

    return { local: false, label: `${protocol}//${host}${pathname === '/' ? '' : pathname}` };
  } catch {
    return describeMultiHost(scheme, url.slice(scheme.length));
  }
}

function describeMultiHost(scheme: string, rest: string): DatabaseLocation {
  const address = rest.slice(rest.lastIndexOf('@') + 1).split(/[?#]/)[0] ?? '';
  const slash = address.indexOf('/');
  const host = (slash < 0 ? address : address.slice(0, slash)).split(',')[0];
  const path = slash < 0 ? '' : address.slice(slash);

  if (!host) return unreadable;

  return { local: false, label: `${scheme}${host}${path === '/' ? '' : path}` };
}

function fieldErrors(error: unknown): string | undefined {
  const fields = (error as ValidationErrors | null)?.data?.errors
    ?.map(({ path, message }) => (path ? `${path} (${message ?? 'invalid'})` : message))
    .filter(Boolean);

  return fields?.length ? fields.join(', ') : undefined;
}

function createError(slug: string, error: unknown): string {
  const fields = fieldErrors(error);

  if (!fields) return formatCliError(error).replace(/^\[frogbot\] (error: )?/, '');
  if (fields.startsWith('email ')) return `${slug} rejected the email: ${fields}.`;

  return `${slug} rejected the user: ${fields}. Pass a missing field with --set <field>=<value>.`;
}

function fail(code: string, message: string): CliError {
  return new CliError(`[frogbot] users create: ${message}`, { code });
}

/**
 * `frogbot users create <email>`: makes the first user of the admin's auth collection, or `--collection`'s,
 * with a random password printed once. It refuses when the collection has any user, trashed ones included,
 * and writes to anything but a local SQLite file only with `--yes`.
 */
export async function users(
  args: string[],
  {
    config,
    loadError,
    json = false,
  }: { config?: FrogBotSanitizedConfig; loadError?: unknown; json?: boolean },
): Promise<Record<string, unknown>> {
  const options = parseUsersArgs(args);

  if (loadError) throw new CliError(formatCliError(loadError), { code: 'CONFIG_INVALID' });

  if (!config) throw fail('NO_APP', 'there is no FrogBot app here (no frogbot.config.ts found).');

  const payloadConfig = await config._internal.payloadConfig;
  const slug = options.collection ?? payloadConfig.admin.user;
  const collection = payloadConfig.collections.find((entry) => entry.slug === slug);

  if (!collection?.auth) {
    throw fail('NOT_AUTH_COLLECTION', `"${slug}" isn't an auth collection in this app.`);
  }

  if (collection.auth.disableLocalStrategy) {
    throw fail(
      'NO_PASSWORD_LOGIN',
      `"${slug}" signs in without a password (disableLocalStrategy), so there is no login to create. Sign in with its provider instead.`,
    );
  }

  const { url, syncUrl } = payloadConfig.db as Pick<DatabaseAdapter, 'url' | 'syncUrl'>;
  const database = describeDatabase(url, syncUrl);

  console.log(`[frogbot] users create: database ${database.label}`);

  if (!database.local && !options.yes) {
    throw fail(
      'CONFIRM_REQUIRED',
      "this isn't a local SQLite file, so nothing was written. Run again with --yes if this is the database to add the user to.",
    );
  }

  let frogbot: FrogBot | undefined;

  try {
    const [{ FrogBot }, { withSessionOperation }] = await Promise.all([
      import('../frogbot.js'),
      import('../auth/operation.js'),
    ]);

    frogbot = await new FrogBot().init({ config, disableOnInit: true });

    const instance = frogbot;
    const req = await instance.createRequest();
    const created = await withSessionOperation({
      req,
      collectionSlug: slug,
      fn: async () => {
        const { docs } = await instance.db.find({
          collection: slug,
          limit: 1,
          pagination: false,
          req: toPayloadRequest(req),
        });

        if (docs.length > 0) {
          return fail(
            'USERS_EXIST',
            `the ${slug} collection already has users, so nothing was written. Sign in with one of them, or add users in the admin.`,
          );
        }

        const user = firstUser({ collection, email: options.email, data: options.data });

        try {
          await instance.create({ ...user.create, req });
        } catch (error) {
          return fail('CREATE_FAILED', createError(slug, error));
        }

        return user;
      },
    });

    if (created instanceof CliError) throw created;

    const { password } = created;

    if (!json) {
      console.log(`Created ${options.email} in ${slug}.`);
      console.log(`Password: ${password}`);
      console.log('It is shown only this once. Change it on the account page after signing in.');
    }

    return { email: options.email, collection: slug, database: database.label, password };
  } finally {
    await frogbot?.destroy();
  }
}
