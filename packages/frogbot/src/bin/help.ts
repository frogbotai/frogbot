import { jobsRunUsage } from './jobsRunOptions.js';

const line = (usage: string, describe: string) => `[frogbot] usage: frogbot ${usage}\n${describe}`;

export const upUsage =
  '[frogbot] usage: frogbot up [--port <n|auto>] [--dev] [--autostart] [--json]';

export const downUsage = '[frogbot] usage: frogbot down [folder] [--json]';

export const migrateUsage = `[frogbot] usage: frogbot <migrate|migrate:create|migrate:down|migrate:fresh|migrate:refresh|migrate:reset|migrate:status> [name] [options]

commands:
  migrate                  apply pending migrations
  migrate:create [name]    generate a new migration from the schema
  migrate:down             roll back the last batch of migrations
  migrate:fresh            drop all tables, then apply every migration
  migrate:refresh          roll back every migration, then apply them all again
  migrate:reset            roll back every migration
  migrate:status           show applied and pending migrations

options:
  --name <name>            name for the generated migration (migrate:create)
  --file <path>            use a pre-defined migration file (migrate:create)
  --yes                    answer yes instead of asking: apply over dev-mode changes, drop tables, create an empty migration (migrate, migrate:create, migrate:fresh)
  --force-accept-warning   the same as --yes
  --skip-empty             skip empty migrations (migrate:create)
  --json                   one result object on stdout
  --help, -h               show this help

Without a terminal, a command that would ask stops with exit code 2 unless --yes is passed.`;

/** The groups `frogbot --help` lists, in order. Plugin commands come after `Generate`, under their own group. */
export const coreGroups = ['Run', 'Ship', 'Database', 'Generate'] as const;

/** The group listed last, for commands that work on FrogBot itself. */
export const contributingGroup = 'Contributing';

/** The group a plugin command without its own `group` is listed under. */
export const pluginGroup = 'Plugins';

type Group = (typeof coreGroups)[number] | typeof contributingGroup;

/** A built-in command as `frogbot --help` lists it: its group, one line, and its usage without `frogbot`. */
export type CommandDoc = { group: Group; summary: string; usage: string };

const migrateDoc = (name: string, summary: string, flags = ''): CommandDoc => ({
  group: 'Database',
  summary,
  usage: `${name}${flags} [--json]`,
});

/** One entry per built-in command, in the order `frogbot --help` lists them within a group. */
export const commandDocs: Record<string, CommandDoc> = {
  dev: {
    group: 'Run',
    summary: 'Start the Next.js dev server, after writing the admin import map',
    usage: 'dev [next dev options]',
  },
  start: {
    group: 'Run',
    summary: 'Start the Next.js production server',
    usage: 'start [next start options]',
  },
  up: {
    group: 'Run',
    summary: 'Run the app in the background, rebuilding on each edit',
    usage: upUsage.replace('[frogbot] usage: frogbot ', ''),
  },
  down: {
    group: 'Run',
    summary: 'Stop the app that `up` started',
    usage: downUsage.replace('[frogbot] usage: frogbot ', ''),
  },
  status: {
    group: 'Run',
    summary: 'List every app `up` started on this computer',
    usage: 'status [--json]',
  },
  run: {
    group: 'Run',
    summary: "Run a script with the app's environment and config",
    usage: 'run <file> [args...]',
  },
  'jobs:run': {
    group: 'Run',
    summary: 'Run a jobs worker without Next.js',
    usage:
      'jobs:run [--cron <expression>] [--limit <n>] [--queue <name>] [--all-queues] [--handle-schedules] [--json]',
  },
  'channels:run': {
    group: 'Run',
    summary: 'Hold chat-channel gateway connections in their own process',
    usage: 'channels:run',
  },
  check: {
    group: 'Ship',
    summary: 'Check the config without a server or database',
    usage: 'check [--json]',
  },
  deploy: {
    group: 'Ship',
    summary: 'Check the app, then deploy it to Dojo or a Docker image',
    usage:
      'deploy [target] [--dry-run] [--json] [--no-interactive] [--env-file <path>] [target flags]',
  },
  migrate: migrateDoc('migrate', 'Apply pending migrations', ' [--yes]'),
  'migrate:create': migrateDoc(
    'migrate:create',
    'Write a migration from the schema',
    ' [name] [--name <name>] [--file <path>] [--skip-empty] [--yes]',
  ),
  'migrate:status': migrateDoc('migrate:status', 'Show applied and pending migrations'),
  'migrate:down': migrateDoc('migrate:down', 'Roll back the last batch of migrations'),
  'migrate:refresh': migrateDoc(
    'migrate:refresh',
    'Roll back every migration, then apply them all again',
  ),
  'migrate:reset': migrateDoc('migrate:reset', 'Roll back every migration'),
  'migrate:fresh': migrateDoc(
    'migrate:fresh',
    'Drop all tables, then apply every migration',
    ' [--yes]',
  ),
  users: {
    group: 'Database',
    summary: 'Create the first login of an empty auth collection',
    usage: 'users create <email> [--collection <slug>] [--set <field>=<value>]... [--yes] [--json]',
  },
  'generate:types': {
    group: 'Generate',
    summary: 'Write frogbot-types.ts from the config',
    usage: 'generate:types [--json]',
  },
  'generate:importmap': {
    group: 'Generate',
    summary: 'Write the admin import map',
    usage: 'generate:importmap [--json]',
  },
  'generate:piece-types': {
    group: 'Contributing',
    summary: "Write a piece's action and trigger types",
    usage: 'generate:piece-types <module> --export <factory> --output <file> [--check] [--json]',
  },
  'pieces:port': {
    group: 'Contributing',
    summary: 'Prepare a piece package in the FrogBot repository for porting',
    usage: 'pieces:port <slug> [--json]',
  },
};

/** What `frogbot <command> --help` prints for each built-in but `deploy`, whose targets come from the config. */
export const commandHelp: Record<string, string> = {
  start: line(
    commandDocs.start.usage,
    'Warns when the admin import map is stale, then starts the Next.js production server. `npx next start --help` lists its options.',
  ),
  dev: line(
    commandDocs.dev.usage,
    'Generates the admin import map, then starts the Next.js development server. `npx next dev --help` lists its options.',
  ),
  up: `${upUsage}\nRuns the app in the background, rebuilding and swapping in each edit.\n  --port <n|auto>  the port to serve on, remembered for later runs; auto picks a free one\n  --dev            run next dev with hot reload instead of production builds\n  --autostart      macOS only: also start the app at login\n  --json           one result object on stdout`,
  down: `${downUsage}\nStops the app that \`up\` started in folder, the current one by default.\n  --json  one result object on stdout`,
  status: line(
    commandDocs.status.usage,
    'Lists every app `up` started on this computer.\n  --json  one result object on stdout, with an `apps` array',
  ),
  run: line(
    commandDocs.run.usage,
    "Runs a TypeScript or JavaScript file with your app's environment and config alias; args go to the file.",
  ),
  check: line(
    commandDocs.check.usage,
    'Loads your config as the running app does, with no server or database, and lists every problem it finds.\n  --json  one result object on stdout',
  ),
  users: line(
    commandDocs.users.usage,
    "Creates the first login when the auth collection is empty and prints its random password once.\n  --collection <slug>    the auth collection, when the app has more than one\n  --set <field>=<value>  a value for another required field\n  --yes                  confirm writing to a database that isn't a local SQLite file\n  --json                 one result object on stdout, with the password",
  ),
  'generate:types': line(
    commandDocs['generate:types'].usage,
    'Writes `frogbot-types.ts` from your config.\n  --json  one result object on stdout',
  ),
  'generate:piece-types': line(
    commandDocs['generate:piece-types'].usage,
    "Writes the TypeScript types for a piece's actions and triggers.\n  --check  fail instead of writing when the file is out of date\n  --json   one result object on stdout",
  ),
  'pieces:port': line(
    commandDocs['pieces:port'].usage,
    'Prepares a piece package in the FrogBot repository for porting.',
  ),
  'generate:importmap': line(
    commandDocs['generate:importmap'].usage,
    'Writes the admin import map for the custom components your config references.\n  --json  one result object on stdout',
  ),
  'jobs:run': jobsRunUsage,
  'channels:run': line(
    commandDocs['channels:run'].usage,
    "Holds chat-channel gateway connections, such as Discord's, in their own process.",
  ),
  migrate: migrateUsage,
};

/** Whether `args` ask for help: `--help` or `-h` before any `--`, or, for `run`, in place of the file. */
export function asksForHelp(command: string, args: string[]): boolean {
  const end = args.indexOf('--');
  const own = command === 'run' ? args.slice(0, 1) : end < 0 ? args : args.slice(0, end);

  return own.some((arg) => arg === '--help' || arg === '-h');
}

/** The flags a usage line names, such as `--port` and `--json`. */
export function usageFlags(usage: string): string[] {
  return [...new Set(usage.match(/--[a-z][a-z-]*/g) ?? [])];
}
