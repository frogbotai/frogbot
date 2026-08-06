# @frogbotai/plugin-redirects

Add a redirects collection that can target selected FrogBot collections.

```ts
import { redirectsPlugin } from '@frogbotai/plugin-redirects';
import { buildConfig } from 'frogbot';

export default buildConfig({
  collections: [{ slug: 'pages', fields: [{ name: 'title', type: 'text' }] }],
  plugins: [redirectsPlugin({ collections: ['pages'] })],
});
```

This package delegates to `@payloadcms/plugin-redirects` and preserves its collection targets, redirect types, field override, and collection override options.
