# @frogbotai/plugin-capture

Capture selected FrogBot AI language requests and responses as gzip blobs.

```ts
import { apiKeysPlugin } from '@frogbotai/plugin-api-keys';
import { capturePlugin } from '@frogbotai/plugin-capture';
import { rolesPlugin } from '@frogbotai/plugin-roles';
import { buildConfig } from 'frogbot';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET!,
  db: databaseAdapter,
  collections: [{ slug: 'users', auth: true, fields: [] }],
  plugins: [rolesPlugin(), apiKeysPlugin(), capturePlugin()],
});
```

Capture defaults to `off`. When the API keys plugin runs before capture, the plugin adds `capture` and `captureSampleRate` fields to its collection. Supported policies are `off`, `errors-only`, `sample`, and `full`.

Updates to both capture fields are denied by default. Pass `captureFieldAccess` to provide a field access function.

The default filesystem storage writes `{requestId}.json.gz` under `.frogbot/captures`. Configure a custom object store with `storage.put`:

```ts
capturePlugin({
  defaultPolicy: 'errors-only',
  retentionDays: 14,
  storage: {
    put: (key, bytes) => bucket.put(key, bytes),
    cleanup: (capturedBefore) => deleteCapturesBefore(capturedBefore),
  },
});
```

Custom storage needs `cleanup` only when `retentionDays` is finite. `retentionDays: null` keeps captures indefinitely. Use `apiKeysCollectionSlug` when the API keys plugin uses a custom slug, or set it to `false` to disable per-key integration.

Only `chat.completions`, `messages`, and `responses` operations are captured. `context.capture = false` disables capture for an individual operation. Writes are fire-and-forget and failures are logged without changing the AI response.

Captured payloads are faithful and are not scrubbed. Treat the storage location as sensitive data.
