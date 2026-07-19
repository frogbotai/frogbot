#!/usr/bin/env node
import { dev } from './dev.js';
import { generateTypes } from './generateTypes.js';
import { start } from './start.js';

const command = process.argv[2]?.toLowerCase();

async function run() {
  if (command === 'start') {
    await start();
  } else if (command === 'dev') {
    await dev();
  } else if (command === 'generate:types') {
    await generateTypes();
  } else {
    console.error('[frogbot] usage: frogbot <start|dev|generate:types>');
    process.exit(2);
  }
}

run().catch((err) => {
  console.error('[frogbot] error:', err);
  process.exit(1);
});
