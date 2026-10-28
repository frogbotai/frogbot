import { nestedDocsPlugin as payloadNestedDocsPlugin } from '@payloadcms/plugin-nested-docs';
import type { NestedDocsPluginConfig } from '@payloadcms/plugin-nested-docs/types';
import { definePlugin } from 'frogbot';
import { wrapPayloadPlugin } from 'frogbot/internal';

export type NestedDocsPluginOptions = NestedDocsPluginConfig;

declare module 'frogbot' {
  interface RegisteredPlugins {
    'plugin-nested-docs': NestedDocsPluginOptions;
  }
}

export const nestedDocsPlugin = definePlugin<NestedDocsPluginOptions>({
  slug: 'plugin-nested-docs',
  plugin: ({ config, options }) => wrapPayloadPlugin(payloadNestedDocsPlugin(options))(config),
});
