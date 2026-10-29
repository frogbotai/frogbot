import nextEnvImport from '@next/env';

import type { DojoCommandName } from './commands.js';
import { dojoCommandNames, runDojoCommand } from './commands.js';

const { loadEnvConfig } = nextEnvImport;

const program = 'npx @frogbotai/plugin-dojo';

/** `npx @frogbotai/plugin-dojo <share|pull|logs|logout>`: the Dojo commands, with or without an app. */
export async function bin(): Promise<void> {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');

  const command = process.argv[2]?.toLowerCase() as DojoCommandName | undefined;

  if (!command || !dojoCommandNames.includes(command)) {
    console.error(`[frogbot] usage: ${program} <${dojoCommandNames.join('|')}>`);

    process.exit(2);
  }

  try {
    await runDojoCommand(command, process.argv.slice(3), program);
  } catch (error) {
    const { formatCliError } = await import('frogbot/internal');

    console.error(formatCliError(error));

    process.exit(1);
  }
}
