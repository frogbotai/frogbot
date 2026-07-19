// Loads the repo-root `.env` (gitignored) into process.env for the live e2e
// suite, so provider API keys have one obvious home. Shell-exported values
// win over file values. `export KEY=value` lines are supported.

import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

try {
  const raw = readFileSync(new URL('../../../.env', import.meta.url), 'utf8');
  for (const [key, value] of Object.entries(parseEnv(raw))) {
    process.env[key] ??= value;
  }
} catch {
  // No .env file — keys come from the shell instead.
}
