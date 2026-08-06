import { importExportPlugin as payloadImportExportPlugin } from '@payloadcms/plugin-import-export';
import type { ImportExportPluginConfig } from '@payloadcms/plugin-import-export/types';
import type { Plugin } from 'frogbot';

export type ImportExportPluginOptions = ImportExportPluginConfig;

export function importExportPlugin(options: ImportExportPluginOptions): Plugin {
  return async (config) => await payloadImportExportPlugin(options)(config as never) as unknown as typeof config;
}
