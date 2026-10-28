import { redirectsPlugin as payloadRedirectsPlugin } from '@payloadcms/plugin-redirects';
import type { RedirectsPluginConfig } from '@payloadcms/plugin-redirects/types';
import { definePlugin } from 'frogbot';
import { wrapPayloadPlugin } from 'frogbot/internal';

export type RedirectsPluginOptions = RedirectsPluginConfig;

declare module 'frogbot' {
  interface RegisteredPlugins {
    'plugin-redirects': RedirectsPluginOptions;
  }
}

export const redirectsPlugin = definePlugin<RedirectsPluginOptions>({
  slug: 'plugin-redirects',
  plugin: ({ config, options }) => wrapPayloadPlugin(payloadRedirectsPlugin(options))(config),
});
