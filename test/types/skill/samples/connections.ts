import { createGmail } from '@frogbotai/piece-gmail';
import type { CollectionConfig, ConnectionEntry } from 'frogbot';
import { buildConfig } from 'frogbot';

import { domainConfig } from './domain-context.js';

const gmail = createGmail({
  signIn: true,
  oauth: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  },
});

export const connections: ConnectionEntry[] = [{ piece: gmail, oauth: true }];

export default buildConfig({
  ...domainConfig,
  connections,
});

export const Users: CollectionConfig = {
  slug: 'users',
  auth: { signIn: [gmail] },
  fields: [],
};
