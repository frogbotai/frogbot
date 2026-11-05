// scripts/runApprovalOnce.ts
import { getFrogBot } from 'frogbot';

import config from '../src/frogbot.config';

const frogbot = await getFrogBot({ config });

const job = await frogbot.jobs.queue({
  workflow: 'approval',
  input: { requestId: 'test' },
  overrideAccess: true,
});

await frogbot.jobs.runByID({ id: job.id, overrideAccess: true });

console.log(`[approval] ran job ${job.id}`);
