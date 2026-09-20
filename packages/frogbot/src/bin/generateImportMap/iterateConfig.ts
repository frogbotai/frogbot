import type { Block, Field, SanitizedConfig } from 'payload';
import { genImportMapIterateFields } from 'payload';

import type { AddToImportMap, Imports, InternalImportMap } from './index.js';
import { iterateCollections } from './iterateCollections.js';
import { iterateGlobals } from './iterateGlobals.js';

function iterateBlockReferenceFields({
  addToImportMap,
  baseDir,
  config,
  fields,
  importMap,
  imports,
  visited,
}: {
  addToImportMap: AddToImportMap;
  baseDir: string;
  config: SanitizedConfig;
  fields: unknown[];
  importMap: InternalImportMap;
  imports: Imports;
  visited: WeakSet<object>;
}): void {
  for (const field of fields) {
    if (!field || typeof field !== 'object' || visited.has(field)) continue;

    visited.add(field);

    const value = field as Record<string, unknown>;

    if (Array.isArray(value.fields)) {
      iterateBlockReferenceFields({
        addToImportMap,
        baseDir,
        config,
        fields: value.fields,
        importMap,
        imports,
        visited,
      });
    }

    if (Array.isArray(value.tabs)) {
      iterateBlockReferenceFields({
        addToImportMap,
        baseDir,
        config,
        fields: value.tabs,
        importMap,
        imports,
        visited,
      });
    }

    if (!Array.isArray(value.blockReferences)) continue;

    const blocks = value.blockReferences.filter((block): block is { fields: Field[] } =>
      Boolean(block && typeof block === 'object' && Array.isArray(block.fields)),
    );

    if (blocks.length === 0) continue;

    genImportMapIterateFields({
      addToImportMap,
      baseDir,
      config,
      fields: blocks as Block[],
      importMap,
      imports,
    });

    iterateBlockReferenceFields({
      addToImportMap,
      baseDir,
      config,
      fields: blocks,
      importMap,
      imports,
      visited,
    });
  }
}

export function iterateConfig({
  addToImportMap,
  baseDir,
  config,
  importMap,
  imports,
}: {
  addToImportMap: AddToImportMap;
  baseDir: string;
  config: SanitizedConfig;
  importMap: InternalImportMap;
  imports: Imports;
}) {
  const visited = new WeakSet<object>();

  iterateCollections({
    addToImportMap,
    baseDir,
    collections: config.collections,
    config,
    importMap,
    imports,
  });

  iterateGlobals({
    addToImportMap,
    baseDir,
    config,
    globals: config.globals,
    importMap,
    imports,
  });

  for (const collection of config.collections) {
    iterateBlockReferenceFields({
      addToImportMap,
      baseDir,
      config,
      fields: collection.fields,
      importMap,
      imports,
      visited,
    });
  }

  for (const global of config.globals) {
    iterateBlockReferenceFields({
      addToImportMap,
      baseDir,
      config,
      fields: global.fields,
      importMap,
      imports,
      visited,
    });
  }

  iterateBlockReferenceFields({
    addToImportMap,
    baseDir,
    config,
    fields: config.blocks ?? [],
    importMap,
    imports,
    visited,
  });

  if (config?.blocks) {
    const blocks = Object.values(config.blocks);
    if (blocks?.length) {
      genImportMapIterateFields({
        addToImportMap,
        baseDir,
        config,
        fields: blocks,
        importMap,
        imports,
      });
    }
  }

  if (typeof config.admin?.avatar === 'object') {
    addToImportMap(config.admin?.avatar?.Component);
  }

  addToImportMap(config.admin?.components?.Nav);
  addToImportMap(config.admin?.components?.header);
  addToImportMap(config.admin?.components?.logout?.Button);
  addToImportMap(config.admin?.components?.settingsMenu);
  addToImportMap(config.admin?.components?.graphics?.Icon);
  addToImportMap(config.admin?.components?.graphics?.Logo);
  const shellComponents = config.admin?.components as typeof config.admin.components & {
    afterBottomRail?: string[];
    beforeBottomRail?: string[];
    beforeSidebarClose?: string[];
    navItems?: { icon?: string }[];
    navSections?: string[];
  };
  addToImportMap(shellComponents.afterBottomRail);
  addToImportMap(shellComponents.beforeBottomRail);
  addToImportMap(shellComponents.beforeSidebarClose);

  for (const item of shellComponents.navItems ?? []) addToImportMap(item.icon);
  addToImportMap(shellComponents.navSections);
  const chatComponents = shellComponents as typeof shellComponents & {
    chat?: {
      AssistantMessageActions?: string;
      Chat?: string;
      Greeting?: string;
      toolComponents?: Record<string, Record<string, string>>;
      UserMessageActions?: string;
    };
  };
  addToImportMap(chatComponents.chat?.Chat);
  addToImportMap(chatComponents.chat?.Greeting);
  addToImportMap(chatComponents.chat?.UserMessageActions);
  addToImportMap(chatComponents.chat?.AssistantMessageActions);
  for (const components of Object.values(chatComponents.chat?.toolComponents ?? {})) {
    for (const component of Object.values(components)) addToImportMap(component);
  }

  const settings = (
    config.admin as typeof config.admin & {
      settings?: { Component: string; icon?: string }[];
    }
  ).settings;
  for (const entry of settings ?? []) {
    addToImportMap(entry.Component);
    addToImportMap(entry.icon);
  }

  addToImportMap(config.admin?.components?.actions);
  addToImportMap(config.admin?.components?.afterDashboard);
  addToImportMap(config.admin?.components?.afterLogin);
  addToImportMap(config.admin?.components?.afterNav);
  addToImportMap(config.admin?.components?.afterNavLinks);
  addToImportMap(config.admin?.components?.beforeDashboard);
  addToImportMap(config.admin?.components?.beforeLogin);
  addToImportMap(config.admin?.components?.beforeNav);
  addToImportMap(config.admin?.components?.beforeNavLinks);

  addToImportMap(config.admin?.components?.providers);

  if (config.admin?.components?.views) {
    if (Object.keys(config.admin?.components?.views)?.length) {
      for (const key in config.admin?.components?.views) {
        const adminViewConfig = config.admin?.components?.views[key];
        addToImportMap(adminViewConfig?.Component);
      }
    }
  }

  if (config.admin?.dashboard?.widgets?.length) {
    for (const dashboardWidget of config.admin.dashboard.widgets) {
      addToImportMap(dashboardWidget.Component);
      if (dashboardWidget.fields?.length) {
        genImportMapIterateFields({
          addToImportMap,
          baseDir,
          config,
          fields: dashboardWidget.fields as Field[],
          importMap,
          imports,
        });

        iterateBlockReferenceFields({
          addToImportMap,
          baseDir,
          config,
          fields: dashboardWidget.fields,
          importMap,
          imports,
          visited,
        });
      }
    }
  }

  if (config?.admin?.importMap?.generators?.length) {
    for (const generator of config.admin.importMap.generators) {
      generator({
        addToImportMap,
        baseDir,
        config,
        importMap,
        imports,
      });
    }
  }

  if (config?.admin?.dependencies) {
    for (const dependency of Object.values(config.admin.dependencies)) {
      addToImportMap(dependency.path);
    }
  }
}
