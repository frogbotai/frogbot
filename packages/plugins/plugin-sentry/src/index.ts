import type { PluginOptions } from '@payloadcms/plugin-sentry';
import { sentryPlugin as payloadSentryPlugin } from '@payloadcms/plugin-sentry';
import type { Plugin } from 'frogbot';
import { wrapPayloadPlugin } from 'frogbot/internal';

export type SentryPluginOptions = PluginOptions;

export function sentryPlugin(options: SentryPluginOptions): Plugin {
  return wrapPayloadPlugin(payloadSentryPlugin(options));
}
