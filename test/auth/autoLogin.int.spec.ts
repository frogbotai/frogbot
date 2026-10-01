import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { createClientConfig } from 'payload';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildConfig } from '../../packages/frogbot/src/config/build.js';
import { FrogBot, getFrogBotPayload } from '../../packages/frogbot/src/frogbot.js';
import { getTestDatabaseAdapter } from '../__helpers/shared/db/getTestDatabaseAdapter.js';

const email = 'auto@example.com';

describe(`root admin autoLogin and autoRefresh [${process.env.FROGBOT_DATABASE || 'sqlite'}]`, () => {
  let frogbot: FrogBot;
  let databaseDir: string;

  beforeAll(async () => {
    databaseDir = await mkdtemp(join(tmpdir(), 'frogbot-auto-login-'));

    const config = await buildConfig({
      secret: 'auto-login-test-secret',
      db: await getTestDatabaseAdapter({
        sqlite: sqliteAdapter({ client: { url: `file:${join(databaseDir, 'auto-login.db')}` } }),
      }),
      admin: {
        autoLogin: { email },
        autoRefresh: true,
        importMap: { autoGenerate: false },
        user: 'editors',
      },
      typescript: { autoGenerate: false },
      collections: [{ slug: 'editors', auth: true, fields: [] }],
    });

    frogbot = await new FrogBot().init({ config, disableOnInit: true });

    await frogbot.create({
      collection: 'editors',
      data: { email, password: 'auto-password' },
    });
  });

  afterAll(async () => {
    await frogbot?.destroy();
    await rm(databaseDir, { recursive: true, force: true });
  });

  it('autoLogin authenticates a request without credentials as the configured user', async () => {
    const result = await frogbot.auth({ headers: new Headers() });

    expect(result.user).toMatchObject({ collection: 'editors', email });
  });

  it('autoLogin and autoRefresh reach the admin panel config', async () => {
    const payload = getFrogBotPayload(frogbot);

    const clientConfig = createClientConfig({
      config: payload.config,
      i18n: { t: (key: string) => key } as never,
      importMap: {},
    });

    expect(clientConfig.admin).toMatchObject({ autoLogin: { email }, autoRefresh: true });
  });
});
