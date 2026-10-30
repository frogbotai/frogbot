import fs from 'node:fs';
import path from 'node:path';

import { CONFIG_ANCHORS, replaceOnce } from './anchors.js';

export function applyMeta(dest: string, projectName: string): void {
  const configPath = path.join(dest, 'src', 'frogbot.config.ts');
  const config = fs.readFileSync(configPath, 'utf8');

  fs.writeFileSync(
    configPath,
    replaceOnce(
      config,
      CONFIG_ANCHORS.admin,
      `  admin: { meta: { applicationName: '${projectName}' } },\n`,
      configPath,
      'admin',
    ),
  );
}
