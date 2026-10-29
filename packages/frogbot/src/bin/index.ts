import { loadConfig } from '../config/load.js';
import { findConfigFile, resolveEnvConfigPath } from '../config/resolveConfigPath.js';
import type { FrogBotSanitizedConfig } from '../config/sanitized.js';
import type { CLICommand } from '../config/types.js';
import type { FrogBot } from '../frogbot.js';
import { channelsRun } from './channelsRun.js';
import { dev } from './dev.js';
import { formatCliError } from './formatCliError.js';
import { generateImportMap } from './generateImportMap.js';
import { generatePieceTypesCommand } from './generatePieceTypes.js';
import { generateTypes } from './generateTypes.js';
import { jobsRun } from './jobsRun.js';
import { loadEnv } from './loadEnv.js';
import { migrate } from './migrate.js';
import { piecesPort } from './piecesPort.js';
import { runScript } from './run.js';
import { start } from './start.js';

type Command = (args: string[], command: string) => Promise<unknown> | unknown;

const runMigrate: Command = (args, command) => migrate([command, ...args]);

const commands: Record<string, Command> = {
  start: (args) => start(args),
  dev: (args) => dev(args),
  run: (args) => runScript(args),
  'generate:types': () => generateTypes(),
  'generate:piece-types': (args) => generatePieceTypesCommand(args),
  'pieces:port': (args) => piecesPort(args),
  'generate:importmap': () => generateImportMap(),
  'jobs:run': (args) => jobsRun(args),
  'channels:run': () => channelsRun(),
  migrate: runMigrate,
  'migrate:create': runMigrate,
  'migrate:down': runMigrate,
  'migrate:fresh': runMigrate,
  'migrate:refresh': runMigrate,
  'migrate:reset': runMigrate,
  'migrate:status': runMigrate,
};

const codegenCommands = new Set(['start', 'dev', 'generate:types', 'generate:importmap']);

function usage(appCommands: Record<string, CLICommand>): string {
  const names = [
    ...Object.keys(commands),
    ...Object.keys(appCommands).filter((name) => !Object.hasOwn(commands, name)),
  ];

  return `[frogbot] usage: frogbot <${names.join('|')}>`;
}

async function readConfig(
  command: string | undefined,
): Promise<{ config?: FrogBotSanitizedConfig; loadError?: unknown }> {
  const cwd = process.cwd();

  try {
    if (!(resolveEnvConfigPath(cwd) ?? findConfigFile(cwd))) return {};

    const mode = command && codegenCommands.has(command) ? 'codegen' : 'runtime';

    return { config: await loadConfig({ cwd, mode }) };
  } catch (loadError) {
    return { loadError };
  }
}

async function runAppCommand(
  handler: CLICommand,
  { args, command, config }: { args: string[]; command: string; config: FrogBotSanitizedConfig },
): Promise<void> {
  let frogbot: Promise<FrogBot> | undefined;

  try {
    await handler({
      args,
      command,
      getConfig: () => Promise.resolve(config),
      getFrogBot: (options) =>
        (frogbot ??= import('../frogbot.js').then(({ FrogBot }) =>
          new FrogBot().init({ config, ...options }),
        )),
    });
  } finally {
    await frogbot?.then(
      (instance) => instance.destroy(),
      () => undefined,
    );
  }
}

export async function bin() {
  loadEnv();

  const command = process.argv[2]?.toLowerCase();
  const args = process.argv.slice(3);
  const { config, loadError } = await readConfig(command);
  const appCommands = config?.cli.commands ?? {};
  const appCommand =
    command && Object.hasOwn(appCommands, command) ? appCommands[command] : undefined;

  const handler = command && Object.hasOwn(commands, command) ? commands[command] : undefined;

  if (!command) {
    console.error(usage(appCommands));
    if (loadError) console.error(formatCliError(loadError));

    process.exit(2);
  }

  if (!appCommand && !handler) {
    if (loadError) {
      console.error(formatCliError(loadError));

      process.exit(1);
    }

    console.error(
      config
        ? `[frogbot] "${command}" isn't a command in this app. Plugins add commands: see https://docs.frogbot.ai/getting-started/cli#plugin-commands`
        : `[frogbot] "${command}" isn't a built-in command, and there's no app here to add it. Plugins add commands: see https://docs.frogbot.ai/getting-started/cli#plugin-commands`,
    );

    process.exit(2);
  }

  try {
    if (appCommand && config) await runAppCommand(appCommand, { args, command, config });
    else await handler?.(args, command);
  } catch (error) {
    console.error(formatCliError(error));

    process.exit(1);
  }

  if (appCommand) {
    await Promise.all(
      [process.stdout, process.stderr].map(
        (stream) => new Promise((resolve) => stream.write('', resolve)),
      ),
    );

    process.exit(process.exitCode ?? 0);
  }
}
