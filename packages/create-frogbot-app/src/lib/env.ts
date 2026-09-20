import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { ScaffoldPlan } from '../types.js';
import { providerEnv } from './ai.js';
import { databaseUrl } from './db.js';

function setLine(source: string, key: string, value: string): string {
  const prefix = `${key}=`;
  const lines = source.trimEnd().split('\n');
  const index = lines.findIndex((line) => line.startsWith(prefix));

  if (index === -1) lines.push(`${prefix}${value}`);
  else lines[index] = `${prefix}${value}`;

  return `${lines.join('\n')}\n`;
}

export function writeEnv(
  dest: string,
  plan: Pick<ScaffoldPlan, 'ai' | 'database' | 'projectName'>,
): void {
  const examplePath = path.join(dest, '.env.example');
  let example = fs.readFileSync(examplePath, 'utf8');

  example = setLine(example, 'DATABASE_URL', databaseUrl(plan.database, plan.projectName));

  for (const line of providerEnv(plan.ai)) {
    const [key, ...value] = line.split('=');
    example = setLine(example, key, value.join('='));
  }

  fs.writeFileSync(examplePath, example);

  const env = setLine(example, 'FROGBOT_SECRET', randomBytes(24).toString('hex'));
  fs.writeFileSync(path.join(dest, '.env'), env);
}
