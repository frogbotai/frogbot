import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { createResend } from '@frogbotai/piece-resend';
import { s3Storage } from '@frogbotai/storage-s3';
import type { FrogBotInstance } from 'frogbot';
import { buildConfig } from 'frogbot';

import { Media } from './collections.js';

export const databaseConfig = buildConfig({
  secret: process.env.FROGBOT_SECRET!,
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URL! },
  }),
  collections: [],
});

export const storageConfig = buildConfig({
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

export const resend = createResend({
  auth: { apiKey: process.env.RESEND_API_KEY! },
  from: { address: 'notifications@example.com', name: 'Acme' },
});

export const config = buildConfig({
  secret: process.env.FROGBOT_SECRET!,
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL! } }),
  collections: [],
  email: resend,
});

export async function sendEmail(frogbot: FrogBotInstance) {
  await frogbot.email.sendEmail({
    to: 'customer@example.com',
    subject: 'Order confirmed',
    text: 'Your order is confirmed.',
  });
}
