import { stripePlugin as payloadStripePlugin } from '@payloadcms/plugin-stripe';
import type { StripePluginConfig } from '@payloadcms/plugin-stripe/types';
import { definePlugin } from 'frogbot';
import { wrapPayloadPlugin } from 'frogbot/internal';

export type StripePluginOptions = StripePluginConfig;

declare module 'frogbot' {
  interface RegisteredPlugins {
    'plugin-stripe': StripePluginOptions;
  }
}

export const stripePlugin = definePlugin<StripePluginOptions>({
  slug: 'plugin-stripe',
  plugin: ({ config, options }) => wrapPayloadPlugin(payloadStripePlugin(options))(config),
});
