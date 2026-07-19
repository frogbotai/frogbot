import { dev } from './dev.js';
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
  } else {
    console.error('[frogbot] usage: frogbot <start|dev|generate:types>');
    process.exit(2);
  }
}
