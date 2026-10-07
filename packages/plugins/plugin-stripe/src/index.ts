import { stripePlugin as payloadStripePlugin } from '@payloadcms/plugin-stripe';
import type { StripePluginConfig } from '@payloadcms/plugin-stripe/types';
import type { Plugin } from 'frogbot';
import { wrapPayloadPlugin } from 'frogbot/internal';

export type StripePluginOptions = StripePluginConfig;

export function stripePlugin(options: StripePluginOptions): Plugin {
  return wrapPayloadPlugin(payloadStripePlugin(options));
}
