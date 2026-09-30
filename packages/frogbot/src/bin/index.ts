import { channelsRun } from './channelsRun.js';
import { dev } from './dev.js';
import { exportCaptures } from './exportCaptures.js';
import { exportTrainingData } from './exportTrainingData.js';
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
  'export:training-data': (args) => exportTrainingData(args),
  'export:captures': (args) => exportCaptures(args),
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

export async function bin() {
  loadEnv();

  const command = process.argv[2]?.toLowerCase();
  const args = process.argv.slice(3);
  const handler = command && Object.hasOwn(commands, command) ? commands[command] : undefined;

  if (!command || !handler) {
    console.error(`[frogbot] usage: frogbot <${Object.keys(commands).join('|')}>`);

    process.exit(2);
  }

  try {
    await handler(args, command);
  } catch (error) {
    console.error(formatCliError(error));

    process.exit(1);
  }
}
