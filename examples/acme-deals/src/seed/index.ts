import config from '@frogbot-config';
import { getFrogBot } from 'frogbot';

import { DEALS, PASSWORD, USERS } from './data';

if (process.env.NODE_ENV === 'production') {
  throw new Error('The seed is for local development only.');
}

const DAY = 24 * 60 * 60 * 1000;
const frogbot = await getFrogBot({ config });
const ids = new Map<string, number | string>();

for (const user of USERS) {
  const { docs } = await frogbot.find({
    collection: 'users',
    where: { email: { equals: user.email } },
    limit: 1,
    overrideAccess: true,
  });

  const doc =
    docs[0] ??
    (await frogbot.create({
      collection: 'users',
      data: { ...user, password: PASSWORD },
      overrideAccess: true,
    }));

  ids.set(user.email, doc.id);
}

console.log(
  `Users ready: ${USERS.map((u) => u.email).join(', ')} (password: ${PASSWORD})`,
);

// The deals collection arrives in the beat-3e commit; before that, seed users only.
const hasDeals = frogbot.config.collections.some((c) => c.slug === 'deals');
if (!hasDeals) {
  console.log('No deals collection yet: skipped deals.');
} else {
  // Loosely typed so this file typechecks before and after `deals` exists.
  const db = frogbot as unknown as {
    count(args: {
      collection: string;
      overrideAccess: true;
    }): Promise<{ totalDocs: number }>;
    create(args: {
      collection: string;
      data: Record<string, unknown>;
      overrideAccess: true;
    }): Promise<unknown>;
  };

  const { totalDocs } = await db.count({
    collection: 'deals',
    overrideAccess: true,
  });

  if (totalDocs > 0) {
    console.log(`Deals already seeded (${totalDocs}).`);
  } else {
    const today = Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate(),
    );

    for (const { closeInDays, owner, ...deal } of DEALS) {
      await db.create({
        collection: 'deals',
        data: {
          ...deal,
          closeDate: new Date(
            today + closeInDays * DAY + 12 * 60 * 60 * 1000,
          ).toISOString(),
          owner: ids.get(owner),
        },
        overrideAccess: true,
      });
    }

    console.log(`Seeded ${DEALS.length} deals.`);
  }
}
