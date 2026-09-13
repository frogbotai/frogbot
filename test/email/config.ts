import { createResend } from '@frogbotai/piece-resend';
import type { CollectionConfig } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import { usersSlug } from './shared.js';

export const resend = createResend({
  auth: { apiKey: 'email-factory-key' },
  from: { address: 'sender@example.com', name: 'FrogBot' },
});

export const Users: CollectionConfig = {
  slug: usersSlug,
  auth: { verify: true },
  access: openAccess,
  fields: [{ name: 'name', type: 'text' }],
};

export default await buildTestConfig({
  admin: { user: usersSlug, importMap: { autoGenerate: false } },
  collections: [Users],
  connections: [{ piece: resend, secret: true }],
  email: resend,
  serverURL: 'https://email.example.com',
  telemetry: false,
});
