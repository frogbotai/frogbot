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

The import form maps each file column to a field, links relationship columns to existing records by name or another field, and can create the missing ones. It reuses the mapping of your last import with the same headers and, when an AI model is configured, can suggest the rest. Importers that read another tool's API can link records the same way with `resolveRelationship`.

See the [import and export documentation](https://docs.frogbot.ai/plugins/import-export).
