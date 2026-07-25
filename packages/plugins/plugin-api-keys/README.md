# @frogbotai/plugin-api-keys

Add multiple named, independently revocable API keys to a FrogBot application.

```ts
import { apiKeysPlugin } from '@frogbotai/plugin-api-keys';
import { buildConfig } from 'frogbot';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET!,
  db: databaseAdapter,
  collections: [{ slug: 'users', auth: true, fields: [] }],
  plugins: [apiKeysPlugin()],
});
```

The plugin adds an `api-keys` collection, owner-scoped management endpoints, API-key authentication, and Payload-default admin controls. Create a key in the API Keys admin collection, then authenticate requests with either header:

```http
Authorization: Bearer fbt_...
X-API-Key: fbt_...
```

Plaintext keys are returned only when created. The collection stores SHA-256 hashes and supports multiple independently revoked keys per user.

```ts
apiKeysPlugin({
  authCollection: 'accounts',
  collectionSlug: 'credentials',
  tokenPrefix: 'acme',
  headerNames: ['x-service-key'],
  collection: {
    admin: { group: 'Security' },
    fields: [{ name: 'environment', type: 'text' }],
  },
});
```

Collection overrides merge with the generated fields, access, endpoints, hooks, admin components, and transforms applied by other plugins. The manager uses Payload controls without plugin CSS, so global admin styles continue to apply.
