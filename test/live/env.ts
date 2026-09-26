import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const root = new URL('../../', import.meta.url);

for (const file of ['.env.live.local', '.env.local', '.env']) {
  const url = new URL(file, root);

  if (!existsSync(url)) continue;

  const values = parseEnv(readFileSync(url, 'utf8'));

  for (const [key, value] of Object.entries(values)) {
    if (value) process.env[key] ??= value;
  }
}
