import path from 'node:path';

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { sharpTransformer } from '@frogbotai/transformer-sharp';
import { type CollectionConfig, definePiece } from 'frogbot';

import { buildTestConfig } from '../__helpers/shared/buildTestConfig.js';
import { defineEchoPiece } from '../unit/frogbot/triggers/fixtures/piece-echo.js';
import {
  appRoot,
  databasePath,
  dealsSlug,
  filesSlug,
  reminderTaskSlug,
  scansSlug,
  thumbnailSize,
  trainingSessionsSlug,
  usersSlug,
} from './shared.js';

const echo = defineEchoPiece(definePiece)({ prefix: 'echo: ' });

const Deals: CollectionConfig = {
  slug: dealsSlug,
  trash: true,
  fields: [{ name: 'title', type: 'text' }],
};

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  fields: [{ name: 'name', type: 'text' }],
};

const Files: CollectionConfig = {
  slug: filesSlug,
  file: true,
  upload: { staticDir: path.join(appRoot, filesSlug) },
  fields: [],
};

const Scans: CollectionConfig = {
  slug: scansSlug,
  upload: { staticDir: path.join(appRoot, scansSlug), disableLocalStorage: true },
  fields: [],
};

const TrainingSessions: CollectionConfig = {
  slug: trainingSessionsSlug,
  admin: { hidden: true },
  fields: [{ name: 'topic', type: 'text' }],
};

export default await buildTestConfig({
  serverURL: 'http://127.0.0.1:3988',
  db: sqliteAdapter({ client: { url: `file:${databasePath}` } }),
  collections: [Deals, Users, Files, Scans, TrainingSessions],
  ai: { defaultModel: 'openai/gpt-5.4-mini', providers: { openai: { apiKey: 'test-key' } } },
  agents: [
    {
      slug: 'ops',
      instructions: 'Handle echo events.',
      triggers: [
        { trigger: echo.triggers.subscribed, input: { channel: 'alerts' }, handler: () => {} },
      ],
    },
  ],
  jobs: {
    shouldAutoRun: () => false,
    tasks: [{ slug: reminderTaskSlug, handler: () => ({ output: {} }) }],
  },
  upload: {
    transformers: [
      sharpTransformer({
        collections: {
          [filesSlug]: { variants: [{ name: thumbnailSize, width: 16, height: 16 }] },
        },
      }),
    ],
  },
});
