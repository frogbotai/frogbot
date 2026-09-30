import { formatCliError, loadConfig, loadEnv } from 'frogbot/internal';

import { generateSchema } from '../exports/utilities.js';

export async function bin(): Promise<void> {
  loadEnv();

  const command = process.argv[2]?.toLowerCase();

  if (command !== 'generate:schema') {
    console.error('[frogbot] usage: frogbot-graphql generate:schema');

    process.exit(2);
  }

  try {
    const config = await loadConfig({ cwd: process.cwd(), mode: 'codegen' });
    const outputFile = await generateSchema(config);

    console.log(`[frogbot] GraphQL schema written to ${outputFile}`);
  } catch (error) {
    console.error(formatCliError(error));

    process.exit(1);
  }
}
