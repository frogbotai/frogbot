# @frogbotai/plugin-import-export

Add Payload's import and export collections, jobs, and admin controls to FrogBot collections.

```ts
import { importExportPlugin } from '@frogbotai/plugin-import-export';
import { buildConfig } from 'frogbot';

export default buildConfig({
  collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }],
  plugins: [importExportPlugin({ collections: [{ slug: 'posts' }] })],
});
```

This package delegates to `@payloadcms/plugin-import-export`. It preserves the upstream collection, import, export, limit, hook, and override options supported by FrogBot's collection, admin component, i18n, and jobs config surfaces.
