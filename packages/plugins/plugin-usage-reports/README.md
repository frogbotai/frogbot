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

The usage-log list gains Payload's experimental visual grouping. Set `pageSize` to change the local API batch size from its default of `5000`. For CSV export of raw usage rows, add `@frogbotai/plugin-import-export` to `plugins` and target the usage collection:

```ts
plugins: [
  usageReportsPlugin(),
  importExportPlugin({
    collections: [{ slug: 'usage-logs', import: false, export: { format: 'csv' } }],
  }),
];
```

`GET /api/usage/report` accepts `groupBy=model|user|day`, `from`, and `to`. It allows any authenticated caller by default. Pass `access` to narrow it with a normal access function, returning `false` to forbid the request or a `Where` to restrict the rows the report reads:

```ts
usageReportsPlugin({
  access: ({ req }) => (req.user?.isAdmin ? true : { user: { equals: req.user!.id } }),
});
```

The roles plugin composes here without being required, since `allow()` returns an access function:

```ts
import { allow } from '@frogbotai/plugin-roles';

usageReportsPlugin({ access: allow('admin', 'finance', 'auditor') });
```

`groupBy=apiKey` is accepted only when the usage collection already has an `apiKey` relationship. `@frogbotai/plugin-api-keys` adds it, so list `usageReportsPlugin()` after `apiKeysPlugin()`.
