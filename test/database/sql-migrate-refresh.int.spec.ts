import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildConfig } from 'frogbot';
import { FrogBot, getFrogBotPayload } from 'frogbot/test';
import type { Payload } from 'payload';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const adapterName = process.env.FROGBOT_DATABASE ?? 'sqlite';

const migration = `export async function up({ db }) {
  if (!db) throw new Error('up got no db')
}

export async function down({ db }) {
  if (!db) throw new Error('down got no db')
}
`;

describe.skipIf(!['sqlite', 'postgres'].includes(adapterName))(
  `migrate:refresh: ${adapterName}`,
  () => {
    let frogbot: FrogBot;
    let payload: Payload;
    let migrationDir: string;

    const migrationNames = async () =>
      (
        await payload.find({ collection: 'payload-migrations', limit: 0, overrideAccess: true })
      ).docs.map(({ name }) => name);

    beforeAll(async () => {
      const { databaseAdapter } = await import('../databaseAdapter.js');

      frogbot = await new FrogBot().init({
        config: await buildConfig({
          secret: 'sql-migrate-refresh-secret',
          db: databaseAdapter,
          collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }],
          typescript: { autoGenerate: false },
        }),
        disableOnInit: true,
      });

      payload = getFrogBotPayload(frogbot);
      migrationDir = await mkdtemp(join(tmpdir(), `frogbot-migrate-refresh-${adapterName}-`));
      payload.db.migrationDir = migrationDir;

      await writeFile(join(migrationDir, '20260101_000000_refresh.js'), migration);
      await payload.db.migrate({ forceAcceptWarning: true });
    });

    afterAll(async () => {
      await frogbot?.destroy();
      await rm(migrationDir, { recursive: true, force: true });
    });

    it('passes db to every up and down it runs', async () => {
      expect(await migrationNames()).toContain('20260101_000000_refresh');

      await payload.db.migrateRefresh();

      expect(await migrationNames()).toEqual(['20260101_000000_refresh']);
    });
  },
);
