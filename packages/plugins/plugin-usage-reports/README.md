# @frogbotai/plugin-usage-reports

Add adapter-neutral usage analytics to FrogBot.

```ts
import { usageReportsPlugin } from '@frogbotai/plugin-usage-reports';
import { buildConfig } from 'frogbot';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET!,
  db: databaseAdapter,
  collections: [{ slug: 'users', auth: true, fields: [] }],
  ai: { providers },
  plugins: [usageReportsPlugin()],
});
```

The plugin adds a Usage Analytics admin view with the Firmware date range control and sortable Models and Users tables. Reports page through the marker-resolved usage collection with Payload's local API and aggregate in memory, so SQLite, PostgreSQL, and MongoDB use the same path.

The usage-log list gains Payload's experimental visual grouping and export-only CSV support from `@payloadcms/plugin-import-export`. Set `rawExport: false` to omit import/export integration. Set `pageSize` to change the local API batch size from its default of `5000`.

The authenticated `GET /api/usage/report` endpoint accepts `groupBy=model|user|day|apiKey`, `from`, and `to`. API-key groups contain data only when an attribution plugin, such as `@frogbotai/plugin-api-keys`, populated the `apiKey` relationship before usage was logged.
