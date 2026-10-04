import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { apiKeysPlugin } from '@frogbotai/plugin-api-keys';
import { buildConfig, type FrogBotConfig } from 'frogbot';

import { Posts } from './collections/Posts';
import { Users } from './collections/Users';

const config: FrogBotConfig = {
  secret: process.env.FROGBOT_SECRET || '',
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL || '' } }),
  collections: [Users, Posts],
  plugins: [apiKeysPlugin()],
  admin: {
    meta: { titleSuffix: '- Field Lab', openGraph: { siteName: 'Field Lab' } },
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
      beforeLogin: ['/components/LinkProbe#LoginLinkProbe'],
      logout: { Button: '/components/LinkProbe#LogoutLinkProbe' },
      navItems: [
        { label: 'New Chat', path: '/collections/chats/create', icon: 'pencil-edit' },
        { label: 'Reports', path: '/reports', icon: 'home' },
        { label: 'All posts', path: '/collections/posts', icon: '/components/NavIcon#NavIcon' },
      ],
      views: {
        reports: { Component: '/components/ReportsView#ReportsView', path: '/reports' },
        titledReport: {
          Component: '/components/ReportsView#ReportsView',
          meta: { title: 'Titled report' },
          path: '/titled-report',
        },
      },
    },
  },
  settings: [
    {
      label: 'Robot',
      path: 'robot',
      Component: '/components/SettingsPage#SettingsPage',
      icon: 'robot',
    },
    {
      label: 'Usage',
      path: 'usage',
      Component: '/components/SettingsPage#SettingsPage',
      icon: { path: '/components/NavIcon', exportName: 'NavIcon' },
    },
  ],
};

export default buildConfig(config);
