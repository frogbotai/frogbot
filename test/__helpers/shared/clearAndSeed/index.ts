import type { CollectionSlug, FrogBotInstance } from 'frogbot';
import { getFrogBotPayload } from 'frogbot/test';

import { empty } from './scenarios/empty';

export type Scenario = 'empty';

const scenarios = { empty } as const;

/**
 * Truncate every collection on the booted frogbot instance, trashed
 * documents included, then apply the named seeding scenario. Call from
 * `beforeEach` in int specs.
 *
 * A document that another document still requires can't be deleted
 * first, so collections that fail are retried until a pass deletes
 * nothing; whatever is left then throws.
 */
export async function clearAndSeed(frogbot: FrogBotInstance, scenario: Scenario): Promise<void> {
  await clearAll(frogbot);
  await scenarios[scenario](frogbot);
}

async function clearAll(frogbot: FrogBotInstance): Promise<void> {
  // Payload's delete takes `trash: true`, so trashed documents go too; FrogBot's doesn't.
  const payload = getFrogBotPayload(frogbot);
  let pending = Object.keys(frogbot.collections) as CollectionSlug[];

  while (pending.length > 0) {
    const failed: { slug: CollectionSlug; message: string }[] = [];
    let deleted = 0;

    for (const slug of pending) {
      const { docs, errors } = await payload.delete({
        collection: slug,
        where: {},
        overrideAccess: true,
        trash: true,
      });

      deleted += docs.length;

      if (errors.length > 0) failed.push({ slug, message: errors[0].message });
    }

    if (failed.length > 0 && deleted === 0) {
      const reasons = failed.map(({ slug, message }) => `${slug}: ${message}`).join('; ');

      throw new Error(`clearAndSeed could not empty every collection. ${reasons}`);
    }

    pending = failed.map(({ slug }) => slug);
  }
}
