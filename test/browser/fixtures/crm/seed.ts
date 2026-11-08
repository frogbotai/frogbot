import { rmSync } from 'node:fs';
import path from 'node:path';

import config from '@frogbot-config';
import { getFrogBot } from 'frogbot';

import { seed, type SeedResult } from '../../../../templates/crm/src/seed/index';
import { user } from '../../__helpers/signIn';
import { seedActivities } from './edge/activities';
import { seedCompanies } from './edge/companies';
import { seedContacts } from './edge/contacts';
import { seedDeals } from './edge/deals';
import { seedTasks } from './edge/tasks';
import { today } from './shared';

export type Seeded = SeedResult & { frogbot: Awaited<ReturnType<typeof getFrogBot>> };

rmSync(path.resolve('media'), { recursive: true, force: true });

const frogbot = await getFrogBot({ config });

await frogbot.create({
  collection: 'users',
  data: { email: user.email, password: user.password },
  overrideAccess: true,
});

const seeded: Seeded = { ...(await seed({ frogbot, today })), frogbot };

await seedCompanies(seeded);
await seedContacts(seeded);
await seedDeals(seeded);
await seedActivities(seeded);
await seedTasks(seeded);
