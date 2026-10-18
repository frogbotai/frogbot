import type { SanitizedConfig } from 'payload';
import { genImportMapIterateFields } from 'payload';
import { isUserMenuSettingsGroup } from 'payload/shared';

import { isIconComponent } from '../../admin/icons.js';
import type { RootAdminComponents, SettingsEntry } from '../../admin/types.js';
import type { AddToImportMap, Imports, InternalImportMap } from './index.js';
import { iterateCollections } from './iterateCollections.js';
import { iterateGlobals } from './iterateGlobals.js';

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

  for (const item of config.admin?.components?.userMenuSettingsItems ?? []) {
    if (isUserMenuSettingsGroup(item)) {
      for (const groupedItem of item.items) addToImportMap(groupedItem);
    } else {
      addToImportMap(item);
    }
  }

  addToImportMap(config.admin?.components?.graphics?.Icon);
  addToImportMap(config.admin?.components?.graphics?.Logo);

  const shellComponents = config.admin?.components as typeof config.admin.components &
    RootAdminComponents;

  addToImportMap(shellComponents.afterAccountMenu);
  addToImportMap(shellComponents.beforeAccountMenu);
  addToImportMap(shellComponents.afterBottomRail);
  addToImportMap(shellComponents.beforeBottomRail);
  addToImportMap(shellComponents.beforeSidebarClose);

  for (const item of shellComponents.navItems ?? []) {
    if (isIconComponent(item.icon)) addToImportMap(item.icon);
  }

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
      settings?: SettingsEntry[];
    }
  ).settings;

  for (const entry of settings ?? []) {
    addToImportMap(entry.Component);

    if (isIconComponent(entry.icon)) addToImportMap(entry.icon);
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

  for (const tab of config.admin?.components?.sidebar?.tabs ?? []) {
    addToImportMap(tab.components.Icon);
    addToImportMap(tab.components.Content);
  }

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
          fields: dashboardWidget.fields,
          importMap,
          imports,
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
