import { formsPlugin } from '@frogbotai/plugin-forms';

import { buildTestConfig } from '../../__helpers/shared/buildTestConfig.js';
import { Leads, leadsSlug, Users } from '../shared.js';

/** Cloudflare's dummy keys: the secret always fails verification. */
export const turnstileKeys = {
  siteKey: '1x00000000000000000000AA',
  secretKey: '2x0000000000000000000000000000000AA',
};

export const rateLimit = { max: 10, window: 600 };

export default buildTestConfig({
  collections: [Users, Leads],
  plugins: [
    formsPlugin({
      collections: [leadsSlug],
      turnstile: turnstileKeys,
      rateLimit,
      trustProxy: true,
    }),
  ],
});
