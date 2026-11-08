import { sqliteAdapter } from '@frogbotai/db-sqlite';
import type { DeployTarget, FrogBotConfig, Plugin } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';

export const targetName = 'test-host';

/** What the registered target saw, for the suite to check. */
export const seen: { args: string[]; ran: boolean; database?: string } = { args: [], ran: false };

const testHost: DeployTarget = {
  describe: 'A host a plugin adds',
  preflight: (context) => {
    seen.args = context.args;

    return [];
  },
  run: async (context) => {
    seen.ran = true;
    seen.database = context.config.db.name;
    await context.run('host-cli', ['deploy', '--app', 'deals']);

    return { url: 'https://deals.test-host.dev' };
  },
};

const hostPlugin: Plugin = (config) => ({
  ...config,
  cli: { ...config.cli, deployTargets: { ...config.cli?.deployTargets, [targetName]: testHost } },
});

/** The app config, with or without `prodMigrations` on its SQLite adapter. */
export function deployTestConfig({ migrations }: { migrations: boolean }) {
  const db: FrogBotConfig['db'] = sqliteAdapter({
    client: { url: 'file:./test-deploy.db' },
    ...(migrations && {
      prodMigrations: [
        { name: 'init', up: () => Promise.resolve(), down: () => Promise.resolve() },
      ],
    }),
  });

  return buildTestConfig({
    db,
    collections: [{ slug: 'users', auth: true, access: openAccess, fields: [] }],
    plugins: [hostPlugin],
  });
}
