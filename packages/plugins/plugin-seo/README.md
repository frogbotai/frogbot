# @frogbotai/plugin-seo

Add SEO metadata fields, search previews, and generation callbacks to FrogBot collections.

```ts
import { seoPlugin } from '@frogbotai/plugin-seo';
import { buildConfig } from 'frogbot';

export default buildConfig({
  collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }],
  plugins: [
    seoPlugin({
      collections: ['posts'],
      generateTitle: ({ doc }) => doc.title || 'Untitled',
    }),
  ],
});
```

Use the five factories from `@frogbotai/plugin-seo/fields` to place SEO fields in your own groups or tabs. List those collections in `collections` too: generation stays authorized, and the plugin detects the factories' component paths and skips its automatic group or tab. A single SEO field is enough to skip injection; missing fields are not added. Hand-written fields without those component paths, or factory overrides that replace them, are not detected.

Generation callbacks receive a FrogBot request and a partial document typed by `collectionSlug`. The plugin supports field overrides, an uploads collection, and `tabbedUI`.
