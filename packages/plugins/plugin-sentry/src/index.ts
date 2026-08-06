import type { PluginOptions } from '@payloadcms/plugin-sentry';
import { sentryPlugin as payloadSentryPlugin } from '@payloadcms/plugin-sentry';
import type { Plugin } from 'frogbot';

export type SentryPluginOptions = PluginOptions;

export function sentryPlugin(options: SentryPluginOptions): Plugin {
  return (config) => payloadSentryPlugin(options)(config as never) as unknown as typeof config;
}
