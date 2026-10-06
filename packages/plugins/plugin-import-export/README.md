# @frogbotai/plugin-import-export

Add import and export collections, jobs, and admin controls to FrogBot collections.

```ts
import { importExportPlugin } from '@frogbotai/plugin-import-export';
import { buildConfig } from 'frogbot';

export default buildConfig({
  collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }],
  plugins: [importExportPlugin({ collections: [{ slug: 'posts' }] })],
});
```

It supports the collection, import, export, limit, hook, and override options that fit FrogBot's collection, admin component, i18n, and jobs config surfaces.
