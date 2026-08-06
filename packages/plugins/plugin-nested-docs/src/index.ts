import { nestedDocsPlugin as payloadNestedDocsPlugin } from '@payloadcms/plugin-nested-docs';
import type { NestedDocsPluginConfig } from '@payloadcms/plugin-nested-docs/types';
import type { Plugin } from 'frogbot';

export type NestedDocsPluginOptions = NestedDocsPluginConfig;

export function nestedDocsPlugin(options: NestedDocsPluginOptions): Plugin {
  return (config) => payloadNestedDocsPlugin(options)(config as never) as unknown as typeof config;
}
