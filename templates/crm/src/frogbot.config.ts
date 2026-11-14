import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { aiPolicyPlugin } from '@frogbotai/plugin-ai-policy';
import { auditLogPlugin } from '@frogbotai/plugin-audit-log';
import { dojo } from '@frogbotai/plugin-dojo';
import { importExportPlugin } from '@frogbotai/plugin-import-export';
import { lexicalEditor } from '@frogbotai/richtext-lexical';
import { sharpTransformer } from '@frogbotai/transformer-sharp';
import type { FrogBotConfig } from 'frogbot';
import { buildConfig } from 'frogbot';
import { general } from 'frogbot/agents';
import { todoTools } from 'frogbot/tools';

import { assistant } from './agents/assistant';
import { Activities } from './collections/Activities';
import { Companies } from './collections/Companies';
import { Contacts } from './collections/Contacts';
import { Deals } from './collections/Deals';
import { Media } from './collections/Media';
import { Tasks } from './collections/Tasks';
import { Users } from './collections/Users';
import { importExport } from './importExport';
import { auditLogAccess, roles } from './roles';
import { seedEndpoint } from './seed/endpoint';

const config: FrogBotConfig = {
  secret: process.env.FROGBOT_SECRET || '',
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URL || '' },
  }),
  editor: lexicalEditor(),
  collections: [Companies, Contacts, Deals, Activities, Tasks, Users, Media],
  endpoints: [seedEndpoint()],
  tools: [...todoTools],
  ai: {
    defaultModel: 'openai/gpt-5.4-mini',
    providers: { openai: true },
  },
  admin: {
    components: {
      beforeDashboard: ['/components/SeedPanel#SeedPanel'],
    },
    dashboard: {
      widgets: [],
      defaultLayout: [
        { widgetSlug: 'welcome', width: 'full' },
        {
          widgetSlug: 'collection-query',
          width: 'full',
          data: {
            title: 'Open deals closing soon',
            relatedCollection: 'deals',
            where: { stage: { not_in: ['won', 'lost'] } },
            sortField: 'closeDate',
            sortDirection: 'asc',
            limit: 5,
          },
        },
        {
          widgetSlug: 'collection-query',
          width: 'full',
          data: {
            title: 'Open tasks',
            relatedCollection: 'tasks',
            where: { completed: { not_equals: true } },
            sortField: 'dueDate',
            sortDirection: 'asc',
            limit: 5,
          },
        },
        { widgetSlug: 'activity', width: 'full' },
        { widgetSlug: 'collections', width: 'full' },
      ],
    },
  },
  agents: [general(), assistant],
  plugins: [
    aiPolicyPlugin(),
    dojo(),
    roles,
    auditLogPlugin({ overrides: { access: auditLogAccess } }),
    importExportPlugin(importExport),
  ],
  upload: { transformers: [sharpTransformer()] },
};

export default buildConfig(config);
