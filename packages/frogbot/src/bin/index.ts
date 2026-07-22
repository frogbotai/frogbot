import { dev } from './dev.js';
import { generateImportMap } from './generateImportMap.js';
import { generateTypes } from './generateTypes.js';
import { start } from './start.js';

export async function bin() {
  const command = process.argv[2]?.toLowerCase();

  if (command === 'start') {
    await start();
  } else if (command === 'dev') {
    dev();
  } else if (command === 'generate:types') {
    await generateTypes();
  } else if (command === 'generate:importmap') {
    await generateImportMap();
  } else {
    console.error('[frogbot] usage: frogbot <start|dev|generate:types|generate:importmap>');
    process.exit(2);
  }
}
