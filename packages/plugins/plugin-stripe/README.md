# @frogbotai/plugin-stripe

Add Stripe synchronization and webhook endpoints to FrogBot collections.

```ts
import { stripePlugin } from '@frogbotai/plugin-stripe';
import { buildConfig } from 'frogbot';

export default buildConfig({
  collections: [{ slug: 'customers', fields: [{ name: 'email', type: 'email' }] }],
  plugins: [stripePlugin({ stripeSecretKey: process.env.STRIPE_SECRET_KEY! })],
});
```

This package delegates to `@payloadcms/plugin-stripe` and preserves its secret, webhook, REST route, logging, test-key, and collection synchronization options. FrogBot does not add payment flow defaults or webhook handlers.
