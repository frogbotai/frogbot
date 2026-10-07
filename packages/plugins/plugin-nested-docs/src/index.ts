import { nestedDocsPlugin as payloadNestedDocsPlugin } from '@payloadcms/plugin-nested-docs';
import type { NestedDocsPluginConfig } from '@payloadcms/plugin-nested-docs/types';
import type { Plugin } from 'frogbot';
import { wrapPayloadPlugin } from 'frogbot/internal';

export type NestedDocsPluginOptions = NestedDocsPluginConfig;

export function nestedDocsPlugin(options: NestedDocsPluginOptions): Plugin {
  return wrapPayloadPlugin(payloadNestedDocsPlugin(options));
}
