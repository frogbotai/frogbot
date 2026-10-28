import type { Config, PayloadComponent, SanitizedConfig } from 'payload';

import { uiComponentExports } from './uiComponentExports.js';

type BottomRailComponents = {
  afterBottomRail?: PayloadComponent[];
  beforeBottomRail?: PayloadComponent[];
  beforeSidebarClose?: PayloadComponent[];
};

type SettingsComponents = {
  Component: PayloadComponent;
  icon?: PayloadComponent;
};

export type ComponentPathMap = (path: string, exportName?: string) => string;

function rewritePath(path: string, exportName?: string): string {
  if (
    path === '@payloadcms/richtext-lexical' ||
    path.startsWith('@payloadcms/richtext-lexical#') ||
    path.startsWith('@payloadcms/richtext-lexical/')
  ) {
    return path.replace('@payloadcms/richtext-lexical', '@frogbotai/richtext-lexical');
  }

  const [specifier, inlineExport = 'default'] = path.split('#', 2);

  if (
    Object.hasOwn(uiComponentExports, specifier) &&
    uiComponentExports[specifier].has(exportName || inlineExport)
  ) {
    return path.replace('@payloadcms/ui', '@frogbotai/ui/admin');
  }

  if (path.startsWith('@payloadcms/storage-')) {
    return path.replace('@payloadcms/', '@frogbotai/');
  }

  return path;
}

function mapComponent<T>(component: T, map: ComponentPathMap): T {
  if (typeof component === 'string') return map(component) as T;

  if (Array.isArray(component)) return component.map((item) => mapComponent(item, map)) as T;

  if (component && typeof component === 'object' && 'path' in component) {
    const value = component as { exportName?: unknown; path?: unknown };

    if (typeof value.path === 'string') {
      return {
        ...component,
        path: map(value.path, typeof value.exportName === 'string' ? value.exportName : undefined),
      };
    }
  }

  return component;
}

export function rewritePayloadComponent<T>(component: T): T {
  return mapComponent(component, rewritePath);
}

function mapComponents(value: unknown, map: ComponentPathMap): unknown {
  if (typeof value === 'string') return map(value);
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => mapComponents(item, map));
  }

  if ('path' in value && typeof value.path === 'string') {
    return mapComponent(value, map);
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, component]) => [key, mapComponents(component, map)]),
  );
}

type Walk = { map: ComponentPathMap; visited: WeakSet<object> };

function mapRichTextEditor(editor: Record<string, unknown>, walk: Walk): void {
  if (walk.visited.has(editor)) return;

  walk.visited.add(editor);

  for (const key of ['CellComponent', 'DiffComponent', 'FieldComponent'] as const) {
    if (editor[key]) editor[key] = mapComponent(editor[key], walk.map);
  }

  const fieldComponent = editor.FieldComponent;

  if (fieldComponent && typeof fieldComponent === 'object') {
    const serverProps = (fieldComponent as { serverProps?: Record<string, unknown> }).serverProps;

    if (serverProps?.views) serverProps.views = mapComponents(serverProps.views, walk.map);
  }

  const featureMap = (editor.editorConfig as { resolvedFeatureMap?: unknown } | undefined)
    ?.resolvedFeatureMap;

  if (!(featureMap instanceof Map)) return;

  for (const feature of featureMap.values()) {
    if (!feature || typeof feature !== 'object') continue;

    const resolved = feature as Record<string, unknown>;

    if (resolved.ClientFeature) {
      resolved.ClientFeature = mapComponent(resolved.ClientFeature, walk.map);
    }

    if (resolved.componentImports && typeof resolved.componentImports !== 'function') {
      if (Array.isArray(resolved.componentImports)) {
        resolved.componentImports = mapComponent(resolved.componentImports, walk.map);
      } else if (typeof resolved.componentImports === 'object') {
        for (const [key, component] of Object.entries(resolved.componentImports)) {
          (resolved.componentImports as Record<string, unknown>)[key] = mapComponent(
            component,
            walk.map,
          );
        }
      }
    }

    if (!Array.isArray(resolved.nodes)) continue;

    for (const node of resolved.nodes) {
      if (!node || typeof node.getSubFields !== 'function') continue;

      const subFields = node.getSubFields({});

      if (Array.isArray(subFields)) mapFields(subFields, walk);
    }
  }
}

function mapFields(fields: unknown[], walk: Walk): void {
  for (const field of fields) {
    if (!field || typeof field !== 'object') continue;
    const value = field as Record<string, unknown>;

    if (walk.visited.has(value)) continue;

    walk.visited.add(value);

    const admin = value.admin as { components?: unknown } | undefined;
    if (admin?.components) admin.components = mapComponents(admin.components, walk.map);

    if (value.type === 'richText' && value.editor && typeof value.editor === 'object') {
      mapRichTextEditor(value.editor as Record<string, unknown>, walk);
    }

    if (Array.isArray(value.fields)) mapFields(value.fields, walk);
    if (Array.isArray(value.tabs)) {
      for (const tab of value.tabs) {
        if (tab && typeof tab === 'object' && Array.isArray((tab as { fields?: unknown }).fields)) {
          mapFields((tab as { fields: unknown[] }).fields, walk);
        }
      }
    }

    const blocks = value.blocks;

    if (Array.isArray(blocks)) {
      for (const block of blocks) {
        if (block && typeof block === 'object') mapBlock(block, walk);
      }
    }
  }
}

function mapBlock(block: object, walk: Walk): void {
  if (walk.visited.has(block)) return;

  walk.visited.add(block);

  const value = block as Record<string, unknown>;
  const admin = value.admin as { components?: unknown; jsx?: unknown } | undefined;

  if (admin?.components) admin.components = mapComponents(admin.components, walk.map);
  if (admin?.jsx) admin.jsx = mapComponent(admin.jsx, walk.map);

  if (Array.isArray(value.fields)) mapFields(value.fields, walk);
}

/** Calls `map` on every admin component path in `config`, in place, and returns `config`. */
export function mapComponentPaths<T extends Config | SanitizedConfig>(
  config: T,
  map: ComponentPathMap,
): T {
  const walk: Walk = { map, visited: new WeakSet<object>() };
  const admin: Config['admin'] = config.admin;
  const bottomRailComponents = admin?.components as BottomRailComponents | undefined;

  for (const key of ['afterBottomRail', 'beforeBottomRail', 'beforeSidebarClose'] as const) {
    const components = bottomRailComponents?.[key];
    if (components) {
      bottomRailComponents[key] = components.map((component) => mapComponent(component, map));
    }
  }

  const navItems = (admin?.components as { navItems?: { icon?: PayloadComponent }[] } | undefined)
    ?.navItems;

  for (const item of navItems ?? []) {
    if (item.icon) item.icon = mapComponent(item.icon, map);
  }

  if (admin?.dashboard?.widgets) {
    admin.dashboard.widgets = admin.dashboard.widgets.map((widget) => ({
      ...widget,
      Component: mapComponent(widget.Component, map),
    }));

    for (const widget of admin.dashboard.widgets) {
      if (Array.isArray(widget.fields)) mapFields(widget.fields, walk);
    }
  }

  if (admin?.dependencies) {
    admin.dependencies = Object.fromEntries(
      Object.entries(admin.dependencies).map(([key, dependency]) => [
        map(key),
        mapComponent(dependency, map),
      ]),
    );
  }

  if (admin?.components) {
    admin.components = mapComponents(admin.components, map) as typeof admin.components;
  }

  const settings = (admin as typeof admin & { settings?: SettingsComponents[] })?.settings;
  if (settings) {
    for (const entry of settings) {
      entry.Component = mapComponent(entry.Component, map);
      if (entry.icon) entry.icon = mapComponent(entry.icon, map);
    }
  }

  for (const collection of config.collections ?? []) {
    const collectionAdmin = collection.admin as typeof collection.admin & {
      icon?: PayloadComponent;
    };

    if (collectionAdmin?.icon) collectionAdmin.icon = mapComponent(collectionAdmin.icon, map);
    if (collection.admin?.components) {
      collection.admin.components = mapComponents(
        collection.admin.components,
        map,
      ) as typeof collection.admin.components;
    }

    if (collection.fields) mapFields(collection.fields, walk);
  }

  for (const block of config.blocks ?? []) {
    mapBlock(block, walk);
  }

  return config;
}

export function rewriteComponentPaths(config: SanitizedConfig): SanitizedConfig {
  return mapComponentPaths(config, rewritePath);
}
