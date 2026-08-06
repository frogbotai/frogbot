import { stripePlugin as payloadStripePlugin } from '@payloadcms/plugin-stripe';
import type { StripePluginConfig } from '@payloadcms/plugin-stripe/types';
import type { Plugin } from 'frogbot';

export type StripePluginOptions = StripePluginConfig;

export function stripePlugin(options: StripePluginOptions): Plugin {
  return (config) => payloadStripePlugin(options)(config as never) as unknown as typeof config;
}
