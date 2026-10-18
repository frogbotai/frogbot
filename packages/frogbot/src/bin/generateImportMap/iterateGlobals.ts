import type { PayloadComponent, SanitizedConfig, SanitizedGlobalConfig } from 'payload';
import { genImportMapIterateFields } from 'payload';

import type { AddToImportMap, Imports, InternalImportMap } from './index.js';

export function iterateGlobals({
  addToImportMap,
  baseDir,
  config,
  globals,
  importMap,
  imports,
}: {
  addToImportMap: AddToImportMap;
  baseDir: string;
  config: SanitizedConfig;
  globals: SanitizedGlobalConfig[];
  importMap: InternalImportMap;
  imports: Imports;
}) {
  for (const global of globals) {
    genImportMapIterateFields({
      addToImportMap,
      baseDir,
      config,
      fields: global.fields,
      importMap,
      imports,
    });

    addToImportMap(global.admin?.components?.Description);

    addToImportMap(global.admin?.components?.edit?.beforeDocumentControls);
    addToImportMap(global.admin?.components?.edit?.editMenuItems);
    addToImportMap(global.admin?.components?.edit?.PreviewButton);
    addToImportMap(global.admin?.components?.edit?.PublishButton);
    addToImportMap(global.admin?.components?.edit?.SaveButton);
    addToImportMap(global.admin?.components?.edit?.SaveDraftButton);
    addToImportMap(global.admin?.components?.edit?.Status);
    addToImportMap(global.admin?.components?.edit?.UnpublishButton);

    if (global.admin?.components?.views?.edit) {
      for (const editViewConfig of Object.values(global.admin?.components?.views?.edit)) {
        if ('Component' in editViewConfig) {
          addToImportMap(editViewConfig?.Component);
        }

        if ('actions' in editViewConfig) {
          addToImportMap(editViewConfig?.actions);
        }

        if ('tab' in editViewConfig) {
          addToImportMap(editViewConfig?.tab?.Component);
          addToImportMap(editViewConfig?.tab?.Pill);
        }
      }
    }

    if (global.admin?.components?.views) {
      for (const [key, view] of Object.entries(global.admin.components.views)) {
        if (key === 'edit') continue;

        if (view && typeof view === 'object' && 'Component' in view && 'path' in view) {
          addToImportMap((view as { Component: PayloadComponent }).Component);
        }
      }
    }
  }
}
