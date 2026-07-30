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

The plugin adds an `api-keys` collection, owner-scoped management endpoints, API-key authentication, and default admin controls. `frogbot dev` generates the admin import map before starting, so the key-creation controls appear on the first load. Create a key in the API Keys admin collection, then authenticate requests with either header:

```http
Authorization: Bearer fbt_...
X-API-Key: fbt_...
```

Plaintext keys are returned only when created. The collection stores SHA-256 hashes and supports multiple independently revoked keys per user.

With AI configured, usage rows include an optional `apiKey` relationship to the authenticating key. Cookie-authenticated requests omit it, and the relationship follows `collectionSlug`.

Build and start-only workflows must run `frogbot generate:importmap` after adding the plugin. Add it as a `prebuild` step when CI invokes `next build` directly. If the server console suggests `payload generate:importmap`, run `frogbot generate:importmap` instead, or restart `frogbot dev`.

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
