import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { dataSummarizer } from '@frogbotai/piece-data-summarizer';
import { dateHelper } from '@frogbotai/piece-date-helper';
import { googleCalendar } from '@frogbotai/piece-google-calendar';
import { googleDrive } from '@frogbotai/piece-google-drive';
import { googleSheets } from '@frogbotai/piece-google-sheets';
import { linear } from '@frogbotai/piece-linear';
import { pdf } from '@frogbotai/piece-pdf';
import { resend } from '@frogbotai/piece-resend';
import { apiKeysPlugin } from '@frogbotai/plugin-api-keys';
import { oauthPlugin } from '@frogbotai/plugin-oauth';
import { buildConfig } from 'frogbot';
import type { FrogbotConfig } from 'frogbot';

import { qaAnalyst, releaseManager } from './agents';
import { Connections, Media, Releases, Users } from './collections';
import { googleProviders } from './oauthProviders';

const config: FrogbotConfig = {
  secret: process.env.FROGBOT_SECRET ?? 'dev-secret-change-me',
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URL ?? 'file:./frogbot.db'
    }
  }),
  collections: [
    Users,
    Media,
    Releases,
    Connections
  ],
  pieceFiles: { collection: 'media' },
  pieces: [
    googleSheets,
    googleDrive,
    googleCalendar,
    linear,
    resend,
    dateHelper,
    dataSummarizer,
    pdf
  ],
  ai: {
    providers: { openai: true }
  },
  agents: [
    qaAnalyst,
    releaseManager
  ],
  plugins: [
    apiKeysPlugin({ collection: { admin: { group: 'Security' } } }),
    oauthPlugin({ providers: googleProviders }),
  ],
};

export default buildConfig(config);
