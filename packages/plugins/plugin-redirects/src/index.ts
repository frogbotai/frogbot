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
  plugin: async ({ config, options }) => {
    const slug = options.overrides?.slug ?? 'redirects';
    const result = await wrapPayloadPlugin(payloadRedirectsPlugin(options))(config);

    return {
      ...result,
      collections: result.collections.map((collection) =>
        collection.slug === slug && !collection.admin?.icon
          ? { ...collection, admin: { ...collection.admin, icon: 'link-square' } }
          : collection,
      ),
    };
  },
});
