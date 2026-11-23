import config from '@frogbot-config';
import { getFrogBot } from 'frogbot';

import { JOBS, PASSWORD, USERS } from './data';

if (process.env.NODE_ENV === 'production') {
  throw new Error('The seed is for local development only.');
}

const frogbot = await getFrogBot({ config });

for (const user of USERS) {
  const { totalDocs } = await frogbot.count({
    collection: 'users',
    where: { email: { equals: user.email } },
    overrideAccess: true,
  });

  if (totalDocs === 0) {
    await frogbot.create({
      collection: 'users',
      data: { ...user, password: PASSWORD },
      overrideAccess: true,
    });
  }
}

console.log(
  `Users ready: ${USERS.map((u) => u.email).join(', ')} (password: ${PASSWORD})`,
);

// The lawn-jobs collection arrives in the beat-6d commit; before that, seed users only.
const hasJobs = frogbot.config.collections.some((c) => c.slug === 'lawn-jobs');

if (!hasJobs) {
  console.log('No lawn-jobs collection yet: skipped jobs.');
} else {
  // Loosely typed so this file typechecks before and after `jobs` exists.
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
    collection: 'lawn-jobs',
    overrideAccess: true,
  });

  if (totalDocs > 0) {
    console.log(`Jobs already seeded (${totalDocs}).`);
  } else {
    for (const job of JOBS) {
      await db.create({
        collection: 'lawn-jobs',
        data: { ...job },
        overrideAccess: true,
      });
    }

    console.log(`Seeded ${JOBS.length} jobs.`);
  }
}
