# @frogbotai/plugin-nested-docs

Add parent relationships and breadcrumbs to selected FrogBot collections.

```ts
import { nestedDocsPlugin } from '@frogbotai/plugin-nested-docs';
import { buildConfig } from 'frogbot';

export default buildConfig({
  collections: [{ slug: 'pages', fields: [{ name: 'title', type: 'text' }] }],
  plugins: [nestedDocsPlugin({ collections: ['pages'] })],
});
```

This package delegates to `@payloadcms/plugin-nested-docs` and preserves its collection, custom field slug, label, and URL options.
