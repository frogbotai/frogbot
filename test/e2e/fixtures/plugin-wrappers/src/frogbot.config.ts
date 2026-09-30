import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { importExportPlugin } from '@frogbotai/plugin-import-export';
import { seoPlugin } from '@frogbotai/plugin-seo';
import { buildConfig } from 'frogbot';

import { Media, Pages, Posts, Users } from './collections';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET ?? 'browser-test-secret',
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URL ?? 'file:./plugin-wrappers.browser.db' },
  }),
  collections: [Users, Posts, Media, Pages],
  plugins: [
    importExportPlugin({ collections: [{ slug: Posts.slug }] }),
    seoPlugin({
      collections: [Posts.slug, Pages.slug],
      uploadsCollection: Media.slug,
      generateTitle: ({ collectionSlug, doc }) => `${collectionSlug}: ${doc.title}`,
    }),
  ],
  routes: { admin: '/admin' },
  typescript: { autoGenerate: false },
});
