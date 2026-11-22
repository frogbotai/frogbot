import { parseArgs } from 'node:util';

import { firstUser } from '../auth/firstUser.js';
import type { FrogBotSanitizedConfig } from '../config/sanitized.js';
import type { DatabaseAdapter } from '../database/types.js';
import type { FrogBot } from '../frogbot.js';
import { toPayloadRequest } from '../seams/request.js';
import { formatCliError } from './formatCliError.js';

export const usersUsage =
  '[frogbot] usage: frogbot users create <email> [--collection <slug>] [--set <field>=<value>]... [--yes]';

export type UsersCreateOptions = {
  email: string;
  collection?: string;
  data: Record<string, string>;
  yes: boolean;
};

export type DatabaseLocation = { local: boolean; label: string };

type ValidationErrors = { data?: { errors?: { path?: string; message?: string }[] } };

class UsageError extends Error {}

/** Reads `users create`'s arguments, or throws a `UsageError` naming what's wrong. */
export function parseUsersArgs(args: string[]): UsersCreateOptions {
  let parsed: ReturnType<typeof parse>;

  try {
    parsed = parse(args);
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }

  const [subcommand, email, ...extra] = parsed.positionals;

  if (subcommand !== 'create') throw new UsageError('the only users command is `create`.');
  if (!email) throw new UsageError('give the email of the user to create.');
  if (extra.length) throw new UsageError(`unexpected argument "${extra[0]}".`);

  const data: Record<string, string> = {};

  for (const pair of parsed.values.set ?? []) {
    const at = pair.indexOf('=');

    if (at < 1) throw new UsageError(`--set takes <field>=<value>, not "${pair}".`);

    data[pair.slice(0, at)] = pair.slice(at + 1);
  }

  for (const field of ['email', 'password']) {
    if (field in data) throw new UsageError(`--set can't set ${field}.`);
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

/**
 * Names a database URL without its credentials: a `file:` path as written, or `host/name` for a server.
 * Only a `file:` or `:memory:` SQLite URL counts as local.
 */
export function describeDatabase(url: string | undefined): DatabaseLocation {
  if (!url) return { local: false, label: "the adapter's database (it doesn't say where)" };
  if (url.startsWith('file:') || url === ':memory:') return { local: true, label: url };

  try {
    const { host, pathname, protocol } = new URL(url);

    return { local: false, label: `${protocol}//${host}${pathname === '/' ? '' : pathname}` };
  } catch {
    return { local: false, label: 'a database URL that could not be read' };
  }
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

function fail(message: string): number {
  console.error(`[frogbot] users create: ${message}`);

  return 1;
}

/**
 * `frogbot users create <email>`: makes the first user of the admin's auth collection, or `--collection`'s,
 * with a random password printed once. It refuses when the collection has any user, trashed ones included,
 * and writes to anything but a local SQLite file only with `--yes`.
 */
export async function users(
  args: string[],
  { config, loadError }: { config?: FrogBotSanitizedConfig; loadError?: unknown },
): Promise<number> {
  let options: UsersCreateOptions;

  try {
    options = parseUsersArgs(args);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;

    console.error(`[frogbot] users: ${error.message}`);
    console.error(usersUsage);

    return 2;
  }

  if (loadError) {
    console.error(formatCliError(loadError));

    return 1;
  }

  if (!config) return fail('there is no FrogBot app here (no frogbot.config.ts found).');

  const payloadConfig = await config._internal.payloadConfig;
  const slug = options.collection ?? payloadConfig.admin.user;
  const collection = payloadConfig.collections.find((entry) => entry.slug === slug);

  if (!collection?.auth) return fail(`"${slug}" isn't an auth collection in this app.`);

  const database = describeDatabase((payloadConfig.db as Pick<DatabaseAdapter, 'url'>).url);

  console.log(`[frogbot] users create: database ${database.label}`);

  if (!database.local && !options.yes) {
    return fail(
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
          return `the ${slug} collection already has users, so nothing was written. Sign in with one of them, or add users in the admin.`;
        }

        const user = firstUser({ collection, email: options.email, data: options.data });

        try {
          await instance.create({ ...user.create, req });
        } catch (error) {
          return createError(slug, error);
        }

        return user;
      },
    });

    if (typeof created === 'string') return fail(created);

    const { password } = created;

    console.log(`Created ${options.email} in ${slug}.`);
    console.log(`Password: ${password}`);
    console.log('It is shown only this once. Change it on the account page after signing in.');

    return 0;
  } finally {
    await frogbot?.destroy();
  }
}
