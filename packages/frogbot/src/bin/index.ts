import { loadConfig } from '../config/load.js';
import { findConfigFile, resolveEnvConfigPath } from '../config/resolveConfigPath.js';
import type { FrogBotSanitizedConfig } from '../config/sanitized.js';
import type { CLICommand } from '../config/types.js';
import type { FrogBot } from '../frogbot.js';
import { channelsRun } from './channelsRun.js';
import { check } from './check.js';
import { dev } from './dev.js';
import { down } from './down.js';
import { formatCliError } from './formatCliError.js';
import { generateImportMap } from './generateImportMap.js';
import { generatePieceTypesCommand } from './generatePieceTypes.js';
import { generateTypes } from './generateTypes.js';
import { asksForHelp, commandHelp } from './help.js';
import { jobsRun } from './jobsRun.js';
import {
  CliError,
  exitCodeOf,
  failureJson,
  logToStderr,
  ownArgs,
  usageError,
  withoutJson,
  writeJson,
} from './json.js';
import { loadEnv } from './loadEnv.js';
import { migrate } from './migrate.js';
import { overview, overviewJson, version } from './overview.js';
import { piecesPort } from './piecesPort.js';
import { runScript } from './run.js';
import { start } from './start.js';
import { status } from './status.js';
import { up } from './up.js';
import { users } from './usersCreate.js';

type LoadedConfig = { config?: FrogBotSanitizedConfig; loadError?: unknown };

/** A built-in command. */
export type Command = {
  /** Resolves to what `--json` adds to `{ command, success: true }`; a thrown error is the failure. */
  run: (
    args: string[],
    command: string,
    loaded: LoadedConfig,
    json: boolean,
  ) => Promise<Record<string, unknown> | void> | Record<string, unknown> | void;
  help: string | ((args: string[], loaded: LoadedConfig) => Promise<string>);
  /** `true`: `frogbot` reads `--json` and prints the one result; `own`: the command prints it itself. Without it, `--json` is a usage error. */
  json?: true | 'own';
  /** Exit once it resolves, because it leaves database handles open. */
  exit?: true;
};

const runMigrate: Command = {
  run: (args, command) => migrate([command, ...args]),
  help: commandHelp.migrate,
  json: true,
  exit: true,
};

/** The built-in commands, keyed by name. */
export const commands: Record<string, Command> = {
  start: { run: (args) => start(args), help: commandHelp.start },
  dev: { run: (args) => dev(args), help: commandHelp.dev },
  up: { run: (args) => up(args), help: commandHelp.up, json: true },
  down: { run: (args) => down(args), help: commandHelp.down, json: true },
  status: { run: (args) => status(args), help: commandHelp.status, json: true },
  run: { run: (args) => runScript(args), help: commandHelp.run },
  check: { run: (args) => check(args), help: commandHelp.check, json: 'own' },
  users: {
    run: (args, _command, loaded, json) => users(args, { ...loaded, json }),
    help: commandHelp.users,
    json: true,
  },
  deploy: {
    run: async (args, _command, loaded) => {
      const { deploy } = await import('./deploy/command.js');

      process.exitCode = await deploy(args, loaded);
    },
    help: async (args, loaded) => (await import('./deploy/command.js')).deployHelp(args, loaded),
    json: 'own',
  },
  'generate:types': {
    run: () => generateTypes(),
    help: commandHelp['generate:types'],
    json: true,
  },
  'generate:piece-types': {
    run: (args) => generatePieceTypesCommand(args),
    help: commandHelp['generate:piece-types'],
    json: true,
  },
  'pieces:port': {
    run: (args) => piecesPort(args),
    help: commandHelp['pieces:port'],
    json: true,
  },
  'generate:importmap': {
    run: () => generateImportMap(),
    help: commandHelp['generate:importmap'],
    json: true,
  },
  'jobs:run': {
    run: (args) => jobsRun(args),
    help: commandHelp['jobs:run'],
    json: true,
    exit: true,
  },
  'channels:run': { run: () => channelsRun(), help: commandHelp['channels:run'] },
  migrate: runMigrate,
  'migrate:create': runMigrate,
  'migrate:down': runMigrate,
  'migrate:fresh': runMigrate,
  'migrate:refresh': runMigrate,
  'migrate:reset': runMigrate,
  'migrate:status': runMigrate,
};

const codegenCommands = new Set(['start', 'dev', 'generate:types', 'generate:importmap']);

const serviceCommands = new Set(['up', 'down', 'status']);

const helpCommands = new Set(['help', '--help', '-h']);

const versionCommands = new Set(['--version', '-v']);

const pluginDocs = 'https://docs.frogbot.ai/getting-started/cli#plugin-commands';

const dojoPackage = '@frogbotai/plugin-dojo';

async function readConfig(command: string | undefined): Promise<LoadedConfig> {
  const cwd = process.cwd();

  try {
    if (command && (serviceCommands.has(command) || versionCommands.has(command))) return {};
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

async function flush(): Promise<void> {
  await Promise.all(
    [process.stdout, process.stderr].map(
      (stream) => new Promise((resolve) => stream.write('', resolve)),
    ),
  );
}

function unknownCommand(command: string, { config, loadError }: LoadedConfig): CliError {
  if (loadError) return new CliError(formatCliError(loadError), { code: 'CONFIG_INVALID' });

  if (command === 'dojo') {
    return usageError(
      config
        ? `"dojo" isn't a command in this app. Add \`dojo()\` from \`${dojoPackage}\` to \`plugins\` in frogbot.config.ts, or run \`npx ${dojoPackage} <command>\`, which works in any folder.`
        : `There's no app here, so \`frogbot dojo\` isn't available. Run \`npx ${dojoPackage} <command>\` (for example: \`npx ${dojoPackage} login\`), which works in any folder.`,
    );
  }

  return usageError(
    config
      ? `"${command}" isn't a command in this app. Run \`frogbot --help\` for the list. Plugins add commands: see ${pluginDocs}`
      : `"${command}" isn't a built-in command, and there's no app here to add it. Run \`frogbot --help\` for the list. Plugins add commands: see ${pluginDocs}`,
  );
}

async function stop(command: string, error: unknown, json: boolean): Promise<never> {
  if (json) writeJson(failureJson(command, error));
  else if (!(error instanceof CliError && error.reported)) console.error(formatCliError(error));

  await flush();

  return process.exit(exitCodeOf(error));
}

export async function bin() {
  loadEnv();

  const command = process.argv[2]?.toLowerCase();
  const args = process.argv.slice(3);
  const loaded = await readConfig(command);
  const { config, loadError } = loaded;
  const appCommands = config?.cli.commands ?? {};
  const appCommand =
    command && Object.hasOwn(appCommands, command) ? appCommands[command] : undefined;

  const handler = command && Object.hasOwn(commands, command) ? commands[command] : undefined;
  const asksJson = Boolean(command && ownArgs(command, args).includes('--json'));

  if (command && versionCommands.has(command)) {
    console.log(version);

    return process.exit(0);
  }

  if (!command || (helpCommands.has(command) && !appCommand)) {
    if (asksJson) writeJson(overviewJson(appCommands));
    else console.log(overview(appCommands));

    if (loadError) console.error(formatCliError(loadError));

    return process.exit(loadError ? 1 : 0);
  }

  if (handler && !appCommand && asksForHelp(command, args)) {
    const { help } = handler;

    console.log(typeof help === 'string' ? help : await help(args, { config, loadError }));

    return process.exit(0);
  }

  if (appCommand?.usage && asksForHelp(command, args)) {
    console.log(
      `[frogbot] usage: frogbot ${appCommand.usage}${appCommand.summary ? `\n${appCommand.summary}` : ''}`,
    );

    return process.exit(0);
  }

  if (!appCommand && !handler) return stop(command, unknownCommand(command, loaded), asksJson);

  if (appCommand && config) {
    try {
      await runAppCommand(appCommand, { args, command, config });
    } catch (error) {
      return stop(command, error, false);
    }

    await flush();

    return process.exit(process.exitCode ?? 0);
  }

  if (!handler) return;

  const json = asksJson && handler.json === true;

  if (asksJson && !handler.json) {
    return stop(
      command,
      usageError(
        `\`frogbot ${command}\` takes no --json: it runs until you stop it or hands over to another program.`,
      ),
      true,
    );
  }

  const restore = json ? logToStderr() : () => undefined;
  let result: Record<string, unknown> | void;

  try {
    result = await handler.run(json ? withoutJson(command, args) : args, command, loaded, json);
  } catch (error) {
    restore();

    return stop(command, error, asksJson && Boolean(handler.json));
  }

  restore();

  if (json) writeJson({ command, success: true, ...result });

  if (json || handler.exit) {
    await flush();

    return process.exit(process.exitCode ?? 0);
  }
}
