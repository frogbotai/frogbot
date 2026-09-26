import { sqliteD1Adapter } from '@frogbotai/db-d1-sqlite';
import type { FrogBotConfig, FrogBotInstance } from 'frogbot';
import { buildConfig } from 'frogbot';
import { BasePayload, type Payload } from 'payload';
import { describe } from 'vitest';

import { initFrogBotFromPayload } from '../../../packages/frogbot/dist/frogbot.js';
import { createD1Database, type D1Binding, hasMiniflare } from '../../__helpers/shared/db/d1.js';
import { collections as defaultCollections, localization } from './shared.js';

export const describeD1 = hasMiniflare() ? describe : describe.skip;

export type BootOptions = {
  collections?: FrogBotConfig['collections'];
  disableDBConnect?: boolean;
  migrationDir?: string;
  push?: boolean;
};

export type BootedSearch = {
  frogbot: FrogBotInstance;
  payload: Payload;
};

export type SearchDatabase = {
  binding: D1Binding;
  boot: (options?: BootOptions) => Promise<BootedSearch>;
  buildSearchConfig: (options?: BootOptions) => ReturnType<typeof buildConfig>;
  objects: () => Promise<{ name: string; sql: string; type: string }[]>;
  shutdown: () => Promise<void>;
};

export async function createSearchDatabase(): Promise<SearchDatabase> {
  process.env.PAYLOAD_DROP_DATABASE = 'false';

  const database = await createD1Database('frogbot_search');
  const payloads: Payload[] = [];

  const buildSearchConfig = ({
    collections = defaultCollections,
    migrationDir,
    push,
  }: BootOptions = {}) =>
    buildConfig({
      secret: 'frogbot-search-d1',
      db: sqliteD1Adapter({
        binding: database.binding,
        ...(migrationDir ? { migrationDir } : {}),
        ...(push === undefined ? {} : { push }),
      }),
      typescript: { autoGenerate: false },
      collections,
      localization,
    });

  const boot = async ({ disableDBConnect, ...options }: BootOptions = {}) => {
    const config = await buildSearchConfig(options);
    const payload = new BasePayload();

    await payload.init({
      config: config._internal.payloadConfig,
      cron: false,
      disableDBConnect,
      disableOnInit: true,
    });

    payloads.push(payload);

    const frogbot = await initFrogBotFromPayload(payload, config, { disableOnInit: true });

    return { frogbot, payload };
  };

  const objects = async () => {
    const { results } = await database.binding
      .prepare(
        `SELECT "type", "name", "sql" FROM sqlite_master WHERE "name" GLOB 'frogbot_search_*' ORDER BY "name"`,
      )
      .all<{ name: string; sql: string; type: string }>();

    return results;
  };

  const shutdown = async () => {
    for (const payload of payloads) await payload.destroy();

    await database.dispose();
  };

  return { binding: database.binding, boot, buildSearchConfig, objects, shutdown };
}
