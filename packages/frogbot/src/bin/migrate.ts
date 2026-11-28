import { parseArgs } from 'node:util';

import { loadConfig } from '../config/load.js';
import { isFrogBotError } from '../errors/FrogBotError.js';
import { formatCliError } from './formatCliError.js';
import { migrateUsage } from './help.js';
import { CliError, usageError } from './json.js';
import { assertFrogBotPredefined, rewriteMigrationFile } from './migrationFile.js';

const COMMANDS = [
  'migrate',
  'migrate:create',
  'migrate:down',
  'migrate:fresh',
  'migrate:refresh',
  'migrate:reset',
  'migrate:status',
] as const;

type Flags = {
  file?: string;
  forceAcceptWarning?: boolean;
  help?: boolean;
  name?: string;
  skipEmpty?: boolean;
};

function parseFlags(command: string, args: string[]): { flags: Flags; positional: string[] } {
  try {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        file: { type: 'string' },
        'force-accept-warning': { type: 'boolean' },
        yes: { type: 'boolean', short: 'y' },
        'skip-empty': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        name: { type: 'string' },
      },
    });

    return {
      flags: {
        file: values.file,
        forceAcceptWarning: values['force-accept-warning'] || values.yes,
        help: values.help,
        name: values.name,
        skipEmpty: values['skip-empty'],
      },
      positional: positionals,
    };
  } catch (error) {
    const reason = (error instanceof Error ? error.message : String(error)).split('. ')[0];

    throw usageError(`[frogbot] ${reason}. Run \`frogbot ${command} --help\` for the flags.`);
  }
}

const confirmNeeded = (command: string, what: string) =>
  new CliError(
    `[frogbot] ${command} would ask whether to ${what}, and there's no terminal to answer. Run \`frogbot ${command} --yes\` to go ahead.`,
    { code: 'CONFIRM_REQUIRED', exitCode: 2 },
  );

/**
 * Thin wrapper around Payload's migration commands. Uses FrogBot's own config loader (which handles
 * frogbot.config.ts under modern Node), then delegates to the active database adapter. Without a terminal
 * it never asks: a command that would stops with exit code 2 naming `--yes`.
 */
export async function migrate(args: string[]): Promise<Record<string, unknown>> {
  const command = args[0];

  if (!command || !(COMMANDS as readonly string[]).includes(command)) {
    throw usageError(`[frogbot] unknown command: ${command}\n\n${migrateUsage}`);
  }

  const { flags, positional } = parseFlags(command, args.slice(1));

  if (flags.help) {
    console.log(migrateUsage);

    return {};
  }

  const yes = Boolean(flags.forceAcceptWarning);
  const shouldPrompt = Boolean(process.stdin.isTTY);

  process.env.PAYLOAD_MIGRATING = 'true';

  const { default: payload } = await import('payload');

  const cwd = process.cwd();
  const frogbotConfig = await loadConfig({ cwd });
  const config = await frogbotConfig._internal.payloadConfig;
  config.logger = 'sync';

  await payload.init({
    config,
    disableDBConnect: command === 'migrate:create',
    disableOnInit: true,
  });

  const adapter = payload.db;
  let result: { cancelled?: boolean; migrated?: string[]; rolledBack?: string[] } | void =
    undefined;

  let path: string | undefined;
  let migrations: unknown[] | undefined;

  try {
    switch (command) {
      case 'migrate':
        if (yes) {
          result = await adapter.migrate({ forceAcceptWarning: true });
          break;
        }

        if (!shouldPrompt) {
          const hasDevModeMigrations = await payload
            .find({
              collection: 'payload-migrations',
              limit: 1,
              overrideAccess: true,
              where: { batch: { equals: -1 } },
            })
            .then(({ docs }) => docs.length > 0)
            .catch(() => false);

          if (hasDevModeMigrations) {
            throw new CliError(
              '[frogbot] migrate failed: payload_migrations has a dev-mode row (batch -1): this database was changed by schema push in dev mode.\n' +
                'Run `frogbot migrate --yes` to apply migrations anyway, or delete that row if the database already matches your migrations.',
              { code: 'CONFIRM_REQUIRED', exitCode: 2 },
            );
          }
        }

        result = await adapter.migrate({ shouldPrompt });
        if (result?.cancelled && !shouldPrompt) {
          throw confirmNeeded(command, 'apply migrations over dev-mode changes');
        }

        break;
      case 'migrate:create': {
        const migrationName = flags.name ?? positional[0];

        assertFrogBotPredefined(flags.file ?? migrationName);

        const created = await adapter.createMigration({
          file: flags.file,
          forceAcceptWarning: flags.forceAcceptWarning,
          migrationName,
          payload,
          shouldPrompt,
          skipEmpty: flags.skipEmpty,
        });

        if (created?.path) await rewriteMigrationFile(created.path);

        if (created && !created.created && !shouldPrompt && !flags.skipEmpty) {
          throw confirmNeeded(command, 'create an empty migration (no schema changes)');
        }

        path = created?.path;

        break;
      }

      case 'migrate:down':
        result = await adapter.migrateDown();
        break;
      case 'migrate:fresh':
        result = await adapter.migrateFresh({ forceAcceptWarning: yes, shouldPrompt });

        if (result?.cancelled && !shouldPrompt) {
          throw confirmNeeded(command, 'drop every table');
        }

        break;
      case 'migrate:refresh': {
        result = await adapter.migrateRefresh();

        if (result?.cancelled) {
          throw new CliError(
            'payload_migrations has a dev-mode row (batch -1), so migrate:refresh stopped before applying migrations.\n' +
              'Run `frogbot migrate --yes` to apply them anyway, or delete that row if the database already matches your migrations.',
            { code: 'CONFIRM_REQUIRED', exitCode: 2 },
          );
        }

        break;
      }

      case 'migrate:reset':
        result = await adapter.migrateReset();
        break;
      case 'migrate:status':
        migrations = (await adapter.migrateStatus()) ?? [];
        break;
    }
  } catch (err) {
    if (err instanceof CliError || isFrogBotError(err)) throw err;

    throw new CliError(formatCliError(err, `${command} failed`), { code: 'MIGRATE_FAILED' });
  }

  console.log(`[frogbot] ${command} complete.`);

  return {
    ...(result?.migrated && { migrated: result.migrated }),
    ...(result?.rolledBack && { rolledBack: result.rolledBack }),
    ...(path && { path }),
    ...(migrations && { migrations }),
  };
}
