import { searchPlugin as payloadSearchPlugin } from '@payloadcms/plugin-search';
import type { SearchPluginConfig } from '@payloadcms/plugin-search/types';
import type { Plugin } from 'frogbot';

export type SearchPluginOptions<ConfigTypes = unknown> = SearchPluginConfig<ConfigTypes>;

export function searchPlugin<ConfigTypes = unknown>(
  options: SearchPluginOptions<ConfigTypes>,
): Plugin {
  return (config) => payloadSearchPlugin(options)(config as never) as unknown as typeof config;
}
