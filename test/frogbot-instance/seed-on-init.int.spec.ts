import { getPayloadConfig } from 'frogbot/internal';
import { FrogBot } from 'frogbot/test';
import { getPayload } from 'payload';
import { afterEach, describe, expect, it } from 'vitest';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';

const seedTitle = 'Seeded in onInit';

function buildSeedConfig(slug: string) {
  return buildTestConfig({
    collections: [{ slug, access: openAccess, fields: [{ name: 'title', type: 'text' }] }],
    onInit: async (frogbot) => {
      await frogbot.create({
        collection: slug as never,
        data: { title: seedTitle } as never,
        overrideAccess: true,
      });
    },
  });
}

describe('frogbot-instance: seeding in onInit', () => {
  let destroy: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await destroy?.();
    destroy = undefined;
  });

  it('FrogBot.init resolves and finds the seeded record', async () => {
    const frogbot = await new FrogBot().init({ config: await buildSeedConfig('init-posts') });
    destroy = () => frogbot.destroy();

    const { docs } = await frogbot.find({
      collection: 'init-posts' as never,
      overrideAccess: true,
    });

    expect(docs.map((doc) => (doc as { title?: string }).title)).toEqual([seedTitle]);
  });

  it('getPayload resolves and finds the seeded record', async () => {
    const payload = await getPayload({
      config: await getPayloadConfig(await buildSeedConfig('get-payload-posts')),
      key: 'seed-on-init',
    });

    destroy = () => payload.destroy();

    const { docs } = await payload.find({
      collection: 'get-payload-posts' as never,
      overrideAccess: true,
    });

    expect(docs.map((doc) => doc.title)).toEqual([seedTitle]);
  });
});
