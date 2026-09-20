import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { buildConfig, type FrogbotConfig } from 'frogbot';

import { Posts } from './collections/Posts';
import { Users } from './collections/Users';

const config: FrogbotConfig = {
  secret: process.env.FROGBOT_SECRET || '',
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL || '' } }),
  collections: [Users, Posts],
  admin: {
    dashboard: {
      defaultLayout: ({ req }) => [
        {
          data: {
            heading: `Default dashboard (${Object.keys(req.frogbot.collections).length})`,
          },
          widgetSlug: 'welcome',
          width: 'medium',
        },
        {
          widgetSlug: 'activity',
          width: 'small',
        },
      ],
      widgets: [
        {
          slug: 'welcome',
          label: 'Welcome summary',
          Component: '/components/DashboardWidgets#WelcomeWidgetComponent',
          fields: [{ name: 'heading', type: 'text', required: true }],
          minWidth: 'small',
          maxWidth: 'large',
        },
        {
          slug: 'activity',
          label: 'Activity summary',
          Component: '/components/DashboardWidgets#ActivityWidgetComponent',
          minWidth: 'small',
          maxWidth: 'medium',
        },
      ],
    },
    components: {
      navItems: [{ label: 'Reports', path: '/reports' }],
      views: {
        reports: { Component: '/components/ReportsView#ReportsView', path: '/reports' },
      },
    },
  },
};

export default buildConfig(config);
