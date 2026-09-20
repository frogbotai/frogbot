# Adapters

Docs: https://docs.frogbot.ai/database/overview, https://docs.frogbot.ai/upload/storage-adapters, and https://docs.frogbot.ai/email/overview

Install adapter and piece packages separately from `frogbot`. Configure them in `frogbot.config.ts`.

## Database

`db` is required and accepts one database adapter.

| Database        | Package                         | Factory                 |
| --------------- | ------------------------------- | ----------------------- |
| SQLite          | `@frogbotai/db-sqlite`          | `sqliteAdapter`         |
| Postgres        | `@frogbotai/db-postgres`        | `postgresAdapter`       |
| MongoDB         | `@frogbotai/db-mongodb`         | `mongooseAdapter`       |
| Vercel Postgres | `@frogbotai/db-vercel-postgres` | `vercelPostgresAdapter` |
| Cloudflare D1   | `@frogbotai/db-d1-sqlite`       | `sqliteD1Adapter`       |

```ts
import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { buildConfig } from 'frogbot';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET!,
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URL! },
  }),
  collections: [],
});
```

Use the adapter package's exported option types instead of recreating its configuration shape. Do not combine database adapters or pass a connection client where `db` expects an adapter.

## Storage

Register storage adapters in `plugins`. Each storage adapter selects upload collections through its `collections` option.

| Service                              | Package                          | Factory              |
| ------------------------------------ | -------------------------------- | -------------------- |
| Amazon S3 and S3-compatible services | `@frogbotai/storage-s3`          | `s3Storage`          |
| Google Cloud Storage                 | `@frogbotai/storage-gcs`         | `gcsStorage`         |
| Azure Blob Storage                   | `@frogbotai/storage-azure`       | `azureStorage`       |
| Vercel Blob                          | `@frogbotai/storage-vercel-blob` | `vercelBlobStorage`  |
| UploadThing                          | `@frogbotai/storage-uploadthing` | `uploadthingStorage` |
| Cloudflare Workers R2 binding        | `@frogbotai/storage-r2`          | `r2Storage`          |

```ts
import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { s3Storage } from '@frogbotai/storage-s3';
import { buildConfig } from 'frogbot';

import { Media } from './collections/Media';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET!,
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL! } }),
  collections: [Media],
  plugins: [
    s3Storage({
      bucket: process.env.S3_BUCKET!,
      collections: { media: true },
      config: { region: process.env.S3_REGION! },
    }),
  ],
});
```

The keys in `collections` must match configured upload collection slugs. Use `enabled` when an adapter supports optional local configuration.

## Email Pieces

Email is provided by an email-capable piece, not an adapter. `email` accepts an `EmailPiece` or `Promise<EmailPiece>`. The available first-party implementation is `createResend` from `@frogbotai/piece-resend`.

```ts
import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { createResend } from '@frogbotai/piece-resend';
import { buildConfig } from 'frogbot';

const resend = createResend({
  auth: { apiKey: process.env.RESEND_API_KEY! },
  from: { address: 'notifications@example.com', name: 'Acme' },
});

export default buildConfig({
  secret: process.env.FROGBOT_SECRET!,
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL! } }),
  collections: [],
  email: resend,
});
```

Factory credentials send application and authentication email. User connections do not supply those credentials. A configured email piece requires a non-empty default `from.address`, even when a message supplies its own sender.

```ts
await frogbot.email.sendEmail({
  to: 'customer@example.com',
  subject: 'Order confirmed',
  text: 'Your order is confirmed.',
});
```

Supported Resend message fields include `from`, `to`, `cc`, `bcc`, `replyTo`, `subject`, `html`, `text`, and `attachments`. Attachment content must be a string or `Buffer`.
