#!/usr/bin/env node
import { CliError, main } from './dist/index.js';

main().catch((err) => {
  if (err instanceof CliError) console.error(`[create-frogbot-app] error: ${err.message}`);
  else console.error('[create-frogbot-app] error:', err);

  process.exit(1);
});
