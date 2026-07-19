#!/usr/bin/env node
import { main } from './dist/index.js';

main().catch((err) => {
  console.error('[create-frogbot-app] error:', err);
  process.exit(1);
});
