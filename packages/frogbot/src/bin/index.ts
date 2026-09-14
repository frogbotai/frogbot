import { channelsRun } from './channelsRun.js';
import { dev } from './dev.js';
import { exportCaptures } from './exportCaptures.js';
import { exportTrainingData } from './exportTrainingData.js';
import { generateImportMap } from './generateImportMap.js';
import { generatePieceTypesCommand } from './generatePieceTypes.js';
import { generateTypes } from './generateTypes.js';
import { jobsRun } from './jobsRun.js';
import { loadEnv } from './loadEnv.js';
import { migrate } from './migrate.js';
import { piecesPort } from './piecesPort.js';
import { start } from './start.js';

export async function bin() {
  loadEnv();

  const command = process.argv[2]?.toLowerCase();
  const args = process.argv.slice(3);

  if (command === 'start') {
    await start(args);
  } else if (command === 'dev') {
    await dev(args);
  } else if (command === 'generate:types') {
    await generateTypes();
  } else if (command === 'generate:piece-types') {
    await generatePieceTypesCommand(args);
  } else if (command === 'pieces:port') {
    await piecesPort(args);
  } else if (command === 'generate:importmap') {
    await generateImportMap();
  } else if (command === 'export:training-data') {
    await exportTrainingData(args);
  } else if (command === 'export:captures') {
    await exportCaptures(args);
  } else if (command === 'jobs:run') {
    await jobsRun(args);
  } else if (command === 'channels:run') {
    await channelsRun();
  } else if (
    command === 'migrate' ||
    command === 'migrate:create' ||
    command === 'migrate:down' ||
    command === 'migrate:fresh' ||
    command === 'migrate:refresh' ||
    command === 'migrate:reset' ||
    command === 'migrate:status'
  ) {
    await migrate([command, ...args]);
  } else {
    console.error(
      '[frogbot] usage: frogbot <start|dev|generate:types|generate:piece-types|generate:importmap|pieces:port|export:training-data|export:captures|jobs:run|channels:run|migrate|migrate:create|migrate:status|migrate:down|migrate:refresh|migrate:reset|migrate:fresh>',
    );

    process.exit(2);
  }
}
