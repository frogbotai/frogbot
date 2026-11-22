import { jobsRunUsage } from './jobsRunOptions.js';

const line = (usage: string, describe: string) => `[frogbot] usage: frogbot ${usage}\n${describe}`;

export const upUsage = '[frogbot] usage: frogbot up [--port <n|auto>] [--dev] [--autostart]';

export const downUsage = '[frogbot] usage: frogbot down [folder]';

export const migrateUsage = `[frogbot] usage: frogbot <migrate|migrate:create|migrate:down|migrate:fresh|migrate:refresh|migrate:reset|migrate:status> [name] [options]

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
  --force-accept-warning   skip confirmation prompts and apply over dev-mode changes (migrate, migrate:create, migrate:fresh)
  --skip-empty             skip empty migrations (migrate:create)
  --help, -h               show this help`;

/** What `frogbot <command> --help` prints for each built-in but `deploy`, whose targets come from the config. */
export const commandHelp = {
  start: line(
    'start [next start options]',
    'Warns when the admin import map is stale, then starts the Next.js production server. `npx next start --help` lists its options.',
  ),
  dev: line(
    'dev [next dev options]',
    'Generates the admin import map, then starts the Next.js development server. `npx next dev --help` lists its options.',
  ),
  up: `${upUsage}\nRuns the app in the background, rebuilding and swapping in each edit.\n  --port <n|auto>  the port to serve on, remembered for later runs; auto picks a free one\n  --dev            run next dev with hot reload instead of production builds\n  --autostart      macOS only: also start the app at login`,
  down: `${downUsage}\nStops the app that \`up\` started in folder, the current one by default.`,
  status: line('status', 'Lists every app `up` started on this computer.'),
  run: line(
    'run <file> [args...]',
    "Runs a TypeScript or JavaScript file with your app's environment and config alias; args go to the file.",
  ),
  check: line(
    'check [--json]',
    'Loads your config as the running app does, with no server or database, and lists every problem it finds.\n  --json  one result object on stdout',
  ),
  'generate:types': line('generate:types', 'Writes `frogbot-types.ts` from your config.'),
  'generate:piece-types': line(
    'generate:piece-types <module> --export <factory> --output <file> [--check]',
    "Writes the TypeScript types for a piece's actions and triggers.\n  --check  fail instead of writing when the file is out of date",
  ),
  'pieces:port': line(
    'pieces:port <slug>',
    'Prepares a piece package in the FrogBot repository for porting.',
  ),
  'generate:importmap': line(
    'generate:importmap',
    'Writes the admin import map for the custom components your config references.',
  ),
  'jobs:run': jobsRunUsage,
  'channels:run': line(
    'channels:run',
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
