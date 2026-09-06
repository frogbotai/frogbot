import type { PayloadComponent, SanitizedCollectionConfig, SanitizedConfig } from 'payload';
import { genImportMapIterateFields } from 'payload';

import type { AddToImportMap, Imports, InternalImportMap } from './index.js';

export function iterateCollections({
  addToImportMap,
  baseDir,
  collections,
  config,
  importMap,
  imports,
}: {
  addToImportMap: AddToImportMap;
  baseDir: string;
  collections: SanitizedCollectionConfig[];
  config: SanitizedConfig;
  importMap: InternalImportMap;
  imports: Imports;
}) {
  for (const collection of collections) {
    const icon = (collection.admin as typeof collection.admin & { icon?: PayloadComponent })?.icon;
    if (typeof icon !== 'string' || icon.includes('#')) addToImportMap(icon);
    const collectionViews = (
      collection.custom?.frogbot as
        | {
            collectionViews?: Array<{
              component?: PayloadComponent;
              components?: Record<string, PayloadComponent | PayloadComponent[]>;
            }>;
          }
        | undefined
    )?.collectionViews;
    for (const view of collectionViews ?? []) {
      addToImportMap(view.component);
      const components = view.components;
      if (!components) continue;
      for (const component of Object.values(components)) addToImportMap(component);
    }

    genImportMapIterateFields({
      addToImportMap,
      baseDir,
      config,
      fields: collection.fields,
      importMap,
      imports,
    });

    addToImportMap(collection.admin?.components?.afterList);
    addToImportMap(collection.admin?.components?.listMenuItems);
    addToImportMap(collection.admin?.components?.afterListTable);
    addToImportMap(collection.admin?.components?.beforeList);
    addToImportMap(collection.admin?.components?.beforeListTable);
    addToImportMap(collection.admin?.components?.Description);
    addToImportMap(
      (collection.admin?.custom?.frogbot as { descriptionComponent?: PayloadComponent } | undefined)
        ?.descriptionComponent,
    );

    addToImportMap(collection.admin?.components?.edit?.beforeDocumentControls);
    addToImportMap(collection.admin?.components?.edit?.editMenuItems);
    addToImportMap(collection.admin?.components?.edit?.PreviewButton);
    addToImportMap(collection.admin?.components?.edit?.PublishButton);
    addToImportMap(collection.admin?.components?.edit?.SaveButton);
    addToImportMap(collection.admin?.components?.edit?.SaveDraftButton);
    addToImportMap(collection.admin?.components?.edit?.Status);
    addToImportMap(collection.admin?.components?.edit?.UnpublishButton);
    addToImportMap(collection.admin?.components?.edit?.Upload);

    if (collection.upload?.admin?.components?.controls) {
      addToImportMap(collection.upload?.admin?.components?.controls);
    }

    if (collection.admin?.components?.views?.edit) {
      for (const editViewConfig of Object.values(collection.admin?.components?.views?.edit)) {
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

    addToImportMap(collection.admin?.components?.views?.list?.Component);
    addToImportMap(collection.admin?.components?.views?.list?.actions);

    if (collection.admin?.components?.views) {
      for (const [key, view] of Object.entries(collection.admin.components.views)) {
        if (key === 'edit' || key === 'list') {
          continue;
        }
        if (view && typeof view === 'object' && 'Component' in view && 'path' in view) {
          addToImportMap((view as { Component: PayloadComponent }).Component);
        }
      }
    }
  }
}
