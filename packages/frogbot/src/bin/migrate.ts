import { loadConfig } from '../config/load.js';

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

function parseFlags(args: string[]): { flags: Flags; positional: string[] } {
  const flags: Flags = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--file') {
      flags.file = args[++i];
    } else if (arg === '--force-accept-warning') {
      flags.forceAcceptWarning = true;
    } else if (arg === '--skip-empty') {
      flags.skipEmpty = true;
    } else if (arg === '--help' || arg === '-h') {
      flags.help = true;
    } else if (arg === '--name') {
      flags.name = args[++i];
    } else if (arg.startsWith('--name=')) {
      flags.name = arg.slice('--name='.length);
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  return { flags, positional };
}

const usage = (): string =>
  `[frogbot] usage: frogbot <${COMMANDS.join('|')}> [name] [options]

commands:
  migrate                  apply pending migrations
  migrate:create [name]    generate a new migration from the schema
  migrate:down             roll back the last applied migration
  migrate:fresh            drop tables and re-apply all migrations
  migrate:refresh          drop tables and re-apply all migrations
  migrate:reset            drop all tables (dev only)
  migrate:status           show applied and pending migrations

options:
  --name <name>            name for the generated migration (migrate:create)
  --file <path>            use a pre-defined migration file (migrate:create)
  --force-accept-warning   skip interactive confirmation prompts (CI)
  --skip-empty             skip empty migrations (migrate:create)
  --help                   show this help`;

/**
 * Thin wrapper around Payload's migration commands. Uses FrogBot's own
 * config loader (which handles frogbot.config.ts under modern Node), then
 * delegates to the active database adapter.
 */
export async function migrate(args: string[]): Promise<void> {
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.error(usage());
    process.exit(command ? 0 : 2);
  }

  if (!(COMMANDS as readonly string[]).includes(command)) {
    console.error(`[frogbot] unknown command: ${command}\n\n${usage()}`);
    process.exit(2);
  }

  const { flags, positional } = parseFlags(args.slice(1));
  if (flags.help) {
    console.log(usage());
    process.exit(0);
  }

  process.env.PAYLOAD_MIGRATING = 'true';

  const { default: payload } = await import('payload');

  const cwd = process.cwd();
  const frogbotConfig = await loadConfig({ cwd });
  const config = await frogbotConfig._internal.payloadConfig;
  // Use a synchronous logger so CLI output is not truncated by process.exit
  config.logger = 'sync';

  await payload.init({
    config,
    // Schema generation only inspects the schema; no database connection needed
    disableDBConnect: command === 'migrate:create',
    disableOnInit: true,
  });

  const adapter = payload.db;

  try {
    switch (command) {
      case 'migrate':
        await adapter.migrate({});
        break;
      case 'migrate:create':
        await adapter.createMigration({
          file: flags.file,
          forceAcceptWarning: flags.forceAcceptWarning,
          migrationName: flags.name ?? positional[0],
          payload,
          skipEmpty: flags.skipEmpty,
        });
        break;
      case 'migrate:down':
        await adapter.migrateDown();
        break;
      case 'migrate:fresh':
        await adapter.migrateFresh({ forceAcceptWarning: flags.forceAcceptWarning });
        break;
      case 'migrate:refresh':
        await adapter.migrateRefresh();
        break;
      case 'migrate:reset':
        await adapter.migrateReset();
        break;
      case 'migrate:status':
        await adapter.migrateStatus();
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[frogbot] ${command} failed: ${message}`);
    process.exit(1);
  }

  console.log(`[frogbot] ${command} complete.`);
}
