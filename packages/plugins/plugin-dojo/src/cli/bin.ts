import nextEnvImport from '@next/env';

import { runDojoCommand } from './commands.js';

const { loadEnvConfig } = nextEnvImport;

/** `npx @frogbotai/plugin-dojo <command> …`: every Dojo command, with or without an app. */
export async function bin(): Promise<void> {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');

  try {
    await runDojoCommand(process.argv.slice(2), 'npx @frogbotai/plugin-dojo');
  } catch (error) {
    const { formatCliError } = await import('frogbot/internal');

    console.error(formatCliError(error));

    process.exit(1);
  }
}
