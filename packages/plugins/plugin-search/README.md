# @frogbotai/plugin-search

Add a search index collection and synchronization hooks to FrogBot collections.

```ts
import { searchPlugin } from '@frogbotai/plugin-search';
import { buildConfig } from 'frogbot';

export default buildConfig({
  collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }],
  plugins: [searchPlugin({ collections: ['posts'] })],
});
```

This package delegates to `@payloadcms/plugin-search` and preserves its collection selection, synchronization, localization, priority, batching, and search collection override options.
