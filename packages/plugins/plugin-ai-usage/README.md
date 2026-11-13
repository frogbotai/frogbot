# @frogbotai/plugin-ai-usage

Add adapter-neutral usage analytics to FrogBot.

```ts
import { aiUsagePlugin } from '@frogbotai/plugin-ai-usage';
import { buildConfig } from 'frogbot';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET!,
  db: databaseAdapter,
  collections: [{ slug: 'users', auth: true, fields: [] }],
  ai: { providers },
  plugins: [aiUsagePlugin()],
});
```

The plugin adds a Usage Analytics admin view with the FrogBot date range control and sortable Models and Users tables. Each report is one `aggregate` call on the marker-resolved usage collection, so the database does the grouping and sums on SQLite, PostgreSQL, and MongoDB alike.

The usage-log list gains experimental visual grouping. For CSV export of raw usage rows, add `@frogbotai/plugin-import-export` to `plugins` and target the usage collection:

```ts
plugins: [
  aiUsagePlugin(),
  importExportPlugin({
    collections: [{ slug: 'usage-logs', import: false, export: { format: 'csv' } }],
  }),
];
```

`GET /api/usage/report` accepts `groupBy=model|user|day`, `from`, and `to`. It allows any authenticated caller by default. Pass `access` to narrow it with a normal access function, returning `false` to forbid the request or a `Where` to restrict the rows the report reads:

```ts
aiUsagePlugin({
  access: ({ req }) => (req.user?.isAdmin ? true : { user: { equals: req.user!.id } }),
});
```

The roles plugin composes here without being required, since `allow()` returns an access function:

```ts
import { allow } from '@frogbotai/plugin-roles';

aiUsagePlugin({ access: allow('admin', 'finance', 'auditor') });
```

`groupBy=apiKey` is accepted when `@frogbotai/plugin-api-keys` is installed, in any order, or when the usage collection has an `apiKey` relationship.
