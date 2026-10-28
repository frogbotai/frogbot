import type { PluginOptions } from '@payloadcms/plugin-sentry';
import { sentryPlugin as payloadSentryPlugin } from '@payloadcms/plugin-sentry';
import { definePlugin } from 'frogbot';
import { wrapPayloadPlugin } from 'frogbot/internal';

export type SentryPluginOptions = PluginOptions;

declare module 'frogbot' {
  interface RegisteredPlugins {
    'plugin-sentry': SentryPluginOptions;
  }
}

export const sentryPlugin = definePlugin<SentryPluginOptions>({
  slug: 'plugin-sentry',
  plugin: ({ config, options }) => wrapPayloadPlugin(payloadSentryPlugin(options))(config),
});
