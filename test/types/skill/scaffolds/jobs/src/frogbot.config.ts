// host: stands in for the app's config, registered as JOBS.md shows
import { sqliteAdapter } from '@frogbotai/db-sqlite';
import type { FrogBotConfig } from 'frogbot';
import { buildConfig } from 'frogbot';

import { approvalWorkflow } from './jobs/approvalWorkflow';

const config: FrogBotConfig = {
  secret: process.env.FROGBOT_SECRET || '',
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL || '' } }),
  collections: [],
  serverURL: process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000',
  jobs: { workflows: [approvalWorkflow] },
};

export default buildConfig(config);
