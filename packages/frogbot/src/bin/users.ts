import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';

import type { SanitizedCollectionConfig } from 'payload';

import { firstUser } from '../auth/firstUser.js';
import type { FrogBotSanitizedConfig } from '../config/sanitized.js';
import type { DatabaseAdapter } from '../database/types.js';
import type { FrogBot } from '../frogbot.js';
import { toPayloadRequest } from '../seams/request.js';
import { formatCliError } from './formatCliError.js';
import { CliError, usageError } from './json.js';

export const usersUsage = [
  '[frogbot] usage: frogbot users create <email> [--collection <slug>] [--set <field>=<value>]... [--yes] [--json]',
  '                 frogbot users reset-password <email> [--collection <slug>] [--yes] [--json]',
].join('\n');

type UsersTarget = { email: string; collection?: string; yes: boolean };

export type UsersOptions =
  | (UsersTarget & { command: 'create'; data: Record<string, string> })
  | (UsersTarget & { command: 'reset-password' });

export type DatabaseLocation = { local: boolean; label: string };

type ValidationErrors = { data?: { errors?: { path?: string; message?: string }[] } };

/** Reads `users`' arguments, or throws a usage error (exit 2) naming what's wrong and the usage. */
export function parseUsersArgs(args: string[]): UsersOptions {
  try {
    return readUsersArgs(args);
  } catch (error) {
    throw usageError(
      `users: ${error instanceof Error ? error.message : String(error)}\n${usersUsage}`,
    );
  }
}

function readUsersArgs(args: string[]): UsersOptions {
  const parsed = parse(args);

  const [command, email, ...extra] = parsed.positionals;

  if (command !== 'create' && command !== 'reset-password') {
    throw new Error('the users commands are `create` and `reset-password`.');
  }

  if (!email) {
    throw new Error(
      command === 'create'
        ? 'give the email of the user to create.'
        : 'give the email of the user whose password to reset.',
    );
  }

  if (extra.length) throw new Error(`unexpected argument "${extra[0]}".`);

  const target = { email, collection: parsed.values.collection, yes: parsed.values.yes ?? false };

  if (command === 'reset-password') {
    if (parsed.values.set) throw new Error("reset-password doesn't take --set.");

    return { command, ...target };
  }

  const data: Record<string, string> = {};

  for (const pair of parsed.values.set ?? []) {
    const at = pair.indexOf('=');

    if (at < 1) throw new Error(`--set takes <field>=<value>, not "${pair}".`);

    data[pair.slice(0, at)] = pair.slice(at + 1);
  }

  for (const field of ['email', 'password']) {
    if (field in data) throw new Error(`--set can't set ${field}.`);
  }

  return { command, ...target, data };
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

    const credentialed = username || password ? undefined : credentialedPart(url);

    if (credentialed) return describeMultiHost(scheme, credentialed.slice(scheme.length));

    return { local: false, label: `${protocol}//${host}${pathname === '/' ? '' : pathname}` };
  } catch {
    return describeMultiHost(scheme, (credentialedPart(url) ?? url).slice(scheme.length));
  }
}

function credentialedPart(url: string): string | undefined {
  const query = url.search(/[?#]/);
  const at = url.indexOf('@');

  if (at < 0) return undefined;
  if (query < 0) return url;
  if (at < query) return url.slice(0, query);

  return url.slice(query, at).includes('=') ? undefined : url;
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

function cause(error: unknown): string {
  return formatCliError(error).replace(/^\[frogbot\] (error: )?/, '');
}

function createError(slug: string, error: unknown): string {
  const fields = fieldErrors(error);

  if (!fields) return cause(error);
  if (fields.startsWith('email ')) return `${slug} rejected the email: ${fields}.`;

  return `${slug} rejected the user: ${fields}. Pass a missing field with --set <field>=<value>.`;
}

type UsersContext = {
  config: FrogBotSanitizedConfig;
  collection: SanitizedCollectionConfig;
  fail: (code: string, message: string) => CliError;
};

/**
 * `frogbot users create <email>` makes the first user of the admin's auth collection, or `--collection`'s,
 * with a random password printed once, and refuses when the collection has any user, trashed ones included.
 * `frogbot users reset-password <email>` gives an existing user a new random password, printed once,
 * through Payload's reset-password operation with no email sent: the collection's password rules and hooks
 * run, a lockout is cleared, and other sessions end when the collection uses sessions. Once it succeeds, an unverified user is marked
 * verified, as `create` makes its user, so the printed password signs in. Both write to anything but a local SQLite file only with `--yes`.
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
  const fail = (code: string, message: string) =>
    new CliError(`[frogbot] users ${options.command}: ${message}`, { code });

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
      `"${slug}" signs in without a password (disableLocalStrategy), so there is no password to ${options.command === 'create' ? 'create' : 'reset'}. Sign in with its provider instead.`,
    );
  }

  const { url, syncUrl } = payloadConfig.db as Pick<DatabaseAdapter, 'url' | 'syncUrl'>;
  const database = describeDatabase(url, syncUrl);

  console.log(`[frogbot] users ${options.command}: database ${database.label}`);

  if (!database.local && !options.yes) {
    throw fail(
      'CONFIRM_REQUIRED',
      `this isn't a local SQLite file, so nothing was written. Run again with --yes if this is the database to ${options.command === 'create' ? 'add the user to' : 'change the password in'}.`,
    );
  }

  const context = { config, collection, fail };
  const { password } =
    options.command === 'create'
      ? await create(context, options)
      : await resetPassword(context, options.email);

  if (!json) {
    console.log(
      options.command === 'create'
        ? `Created ${options.email} in ${slug}.`
        : `Reset the password of ${options.email} in ${slug}. ${collection.auth.useSessions ? 'Its other sessions are signed out.' : 'Existing tokens stay valid until they expire.'}`,
    );

    console.log(`Password: ${password}`);
    console.log('It is shown only this once. Change it on the account page after signing in.');
  }

  return { email: options.email, collection: slug, database: database.label, password };
}

async function withApp<T>(
  config: FrogBotSanitizedConfig,
  fn: (frogbot: FrogBot) => Promise<T>,
): Promise<T> {
  let frogbot: FrogBot | undefined;

  try {
    const { FrogBot } = await import('../frogbot.js');

    frogbot = await new FrogBot().init({ config, disableOnInit: true });

    return await fn(frogbot);
  } finally {
    await frogbot?.destroy();
  }
}

async function create(
  { config, collection, fail }: UsersContext,
  { email, data }: { email: string; data: Record<string, string> },
) {
  const { slug } = collection;
  const { withSessionOperation } = await import('../auth/operation.js');

  const created = await withApp(config, async (instance) => {
    const req = await instance.createRequest();

    return withSessionOperation({
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
            `the ${slug} collection already has users, so nothing was written. Sign in with one of them, add users in the admin, or run \`frogbot users reset-password <email>\`.`,
          );
        }

        const user = firstUser({ collection, email, data });

        try {
          await instance.create({ ...user.create, req });
        } catch (error) {
          return fail('CREATE_FAILED', createError(slug, error));
        }

        return user;
      },
    });
  });

  if (created instanceof CliError) throw created;

  return created;
}

async function resetPassword({ config, collection, fail }: UsersContext, email: string) {
  const { slug } = collection;
  const password = randomBytes(32).toString('base64url');
  const token = randomBytes(20).toString('hex');

  await withApp(config, async (instance) => {
    const user = await instance.db.findOne<{ id: number | string; _verified?: boolean }>({
      collection: slug,
      where: {
        email: { equals: email.toLowerCase().trim() },
        ...(collection.trash && { deletedAt: { exists: false } }),
      },
    });

    if (!user) {
      throw fail(
        'USER_NOT_FOUND',
        `no user in ${slug} has the email ${email}, so nothing was written.`,
      );
    }

    await instance.db.updateOne({
      collection: slug,
      id: user.id,
      data: {
        resetPasswordToken: token,
        resetPasswordExpiration: new Date(Date.now() + 10 * 60_000).toISOString(),
      },
    });

    try {
      await instance.resetPassword({
        collection: slug,
        data: { token, password },
        overrideAccess: true,
      });
    } catch (error) {
      throw fail('RESET_FAILED', `${slug} rejected the new password: ${cause(error)}`);
    }

    if (collection.auth.verify && !user._verified) {
      await instance.db.updateOne({ collection: slug, id: user.id, data: { _verified: true } });
    }
  });

  return { password };
}
