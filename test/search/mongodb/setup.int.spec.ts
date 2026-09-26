import type { MongooseAdapter } from '@frogbotai/db-mongodb';
import { mongooseAdapter } from '@frogbotai/db-mongodb';
import { afterEach, describe, expect, it } from 'vitest';

import { buildConfig } from '../../../packages/frogbot/src/config/build.js';
import type { FrogBotConfig } from '../../../packages/frogbot/src/config/types.js';
import { FrogBot } from '../../../packages/frogbot/src/frogbot.js';
import { openAccess } from '../../__helpers/shared/buildTestConfig.js';

const collection = 'search-setup-documents';

function getURL(): string {
  const url = new URL(
    process.env.MONGODB_URI || 'mongodb://localhost:27018?directConnection=true&replicaSet=rs0',
  );

  url.pathname = '/frogbot-test-search-setup';

  return url.toString();
}

function buildSetupConfig(search?: FrogBotConfig['collections'][number]['search']) {
  return buildConfig({
    secret: 'search-setup',
    db: mongooseAdapter({ url: getURL() }),
    typescript: { autoGenerate: false },
    localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
    collections: [
      {
        slug: collection,
        access: openAccess,
        versions: { drafts: true },
        fields: [
          { name: 'title', type: 'text' },
          { name: 'embedding', type: 'vector', dimensions: 3 },
          { name: 'localizedEmbedding', type: 'vector', dimensions: 3, localized: true },
          {
            name: 'group',
            type: 'group',
            fields: [{ name: 'embedding', type: 'vector', dimensions: 3 }],
          },
        ],
        ...(search ? { search } : {}),
      },
    ],
  });
}

describe.skipIf(process.env.FROGBOT_DATABASE !== 'mongodb')('MongoDB search setup', () => {
  let frogbot: FrogBot | undefined;

  afterEach(async () => {
    await frogbot?.destroy();

    frogbot = undefined;
  });

  it.each([
    { mode: 'lexical', search: { titles: { lexical: { fields: ['title'] } } } },
    { mode: 'vector', search: { titles: { vector: { field: 'embedding' } } } },
  ])('fails setup without search infrastructure for a $mode index', async ({ mode, search }) => {
    const config = await buildSetupConfig(search);

    await expect(new FrogBot().init({ config })).rejects.toThrow(
      new RegExp(`titles.*${collection}.*${mode}.*missing-prerequisite: search-infrastructure`),
    );
  });

  it('stores vectors without search infrastructure', async () => {
    frogbot = await new FrogBot().init({ config: await buildSetupConfig() });

    const { connection } = (frogbot as unknown as { payload: { db: MongooseAdapter } }).payload.db;

    await Promise.all(Object.values(connection.models).map((model) => model.init()));

    const created = await frogbot.create({
      collection,
      data: {
        title: 'Stored',
        embedding: [1, 2, 3],
        localizedEmbedding: [4, 5, 6],
        group: { embedding: [7, 8, 9] },
        _status: 'published',
      },
      locale: 'en',
      overrideAccess: true,
    });

    await frogbot.update({
      collection,
      id: created.id,
      data: { localizedEmbedding: [6, 5, 4] },
      locale: 'fr',
      overrideAccess: true,
    });

    await frogbot.update({
      collection,
      id: created.id,
      data: { embedding: [3, 2, 1] },
      draft: true,
      overrideAccess: true,
    });

    const published = await frogbot.findByID({
      collection,
      id: created.id,
      locale: 'all',
      overrideAccess: true,
    });

    const draft = await frogbot.findByID({
      collection,
      id: created.id,
      draft: true,
      overrideAccess: true,
    });

    expect(published.embedding).toEqual([1, 2, 3]);
    expect(published.localizedEmbedding).toEqual({ en: [4, 5, 6], fr: [6, 5, 4] });
    expect(published.group?.embedding).toEqual([7, 8, 9]);
    expect(draft.embedding).toEqual([3, 2, 1]);
  });
});
