import type { PayloadComponent, SanitizedConfig } from 'payload';

type BottomRailComponents = {
  afterBottomRail?: PayloadComponent[];
  beforeBottomRail?: PayloadComponent[];
  beforeSidebarClose?: PayloadComponent[];
};

type SettingsComponents = {
  Component: PayloadComponent;
  icon?: PayloadComponent;
};

function rewritePath(path: string): string {
  if (
    path === '@payloadcms/richtext-lexical' ||
    path.startsWith('@payloadcms/richtext-lexical#') ||
    path.startsWith('@payloadcms/richtext-lexical/')
  ) {
    return path.replace('@payloadcms/richtext-lexical', '@frogbotai/richtext-lexical');
  }

  if (path.startsWith('@payloadcms/next/rsc#') || path.startsWith('@payloadcms/next/client#')) {
    return path.replace('@payloadcms/next/', '@frogbotai/next/');
  }
  if (path.startsWith('@payloadcms/storage-')) {
    return path.replace('@payloadcms/', '@frogbotai/');
  }
  return path;
}

export function rewritePayloadComponent<T>(component: T): T {
  if (typeof component === 'string') return rewritePath(component) as T;

  if (Array.isArray(component)) return component.map(rewritePayloadComponent) as T;

  if (component && typeof component === 'object' && 'path' in component) {
    const value = component as { path?: unknown };

    if (typeof value.path === 'string') {
      return { ...component, path: rewritePath(value.path) };
    }
  }

  return component;
}

function rewriteComponent<T extends PayloadComponent>(component: T): T {
  return rewritePayloadComponent(component);
}

function rewriteComponents(value: unknown): unknown {
  if (typeof value === 'string') return rewritePath(value);
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map(rewriteComponents);
  }
  if ('path' in value && typeof value.path === 'string') {
    return rewriteComponent(value as PayloadComponent);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, component]) => [key, rewriteComponents(component)]),
  );
}

function rewriteRichTextEditor(editor: Record<string, unknown>, visited: WeakSet<object>): void {
  if (visited.has(editor)) return;

  visited.add(editor);

  for (const key of ['CellComponent', 'DiffComponent', 'FieldComponent'] as const) {
    if (editor[key]) editor[key] = rewritePayloadComponent(editor[key]);
  }

  const fieldComponent = editor.FieldComponent;

  if (fieldComponent && typeof fieldComponent === 'object') {
    const serverProps = (fieldComponent as { serverProps?: Record<string, unknown> }).serverProps;

    if (serverProps?.views) serverProps.views = rewriteComponents(serverProps.views);
  }

  const featureMap = (editor.editorConfig as { resolvedFeatureMap?: unknown } | undefined)
    ?.resolvedFeatureMap;

  if (!(featureMap instanceof Map)) return;

  for (const feature of featureMap.values()) {
    if (!feature || typeof feature !== 'object') continue;

    const resolved = feature as Record<string, unknown>;

    if (resolved.ClientFeature) {
      resolved.ClientFeature = rewritePayloadComponent(resolved.ClientFeature);
    }

    if (resolved.componentImports && typeof resolved.componentImports !== 'function') {
      if (Array.isArray(resolved.componentImports)) {
        resolved.componentImports = rewritePayloadComponent(resolved.componentImports);
      } else if (typeof resolved.componentImports === 'object') {
        for (const [key, component] of Object.entries(resolved.componentImports)) {
          (resolved.componentImports as Record<string, unknown>)[key] =
            rewritePayloadComponent(component);
        }
      }
    }

    if (!Array.isArray(resolved.nodes)) continue;

    for (const node of resolved.nodes) {
      if (!node || typeof node.getSubFields !== 'function') continue;

      const subFields = node.getSubFields({});

      if (Array.isArray(subFields)) rewriteFields(subFields, visited);
    }
  }
}

function rewriteFields(fields: unknown[], visited: WeakSet<object>): void {
  for (const field of fields) {
    if (!field || typeof field !== 'object') continue;
    const value = field as Record<string, unknown>;

    if (visited.has(value)) continue;

    visited.add(value);

    const admin = value.admin as { components?: unknown } | undefined;
    if (admin?.components) admin.components = rewriteComponents(admin.components);

    if (value.type === 'richText' && value.editor && typeof value.editor === 'object') {
      rewriteRichTextEditor(value.editor as Record<string, unknown>, visited);
    }

    if (Array.isArray(value.fields)) rewriteFields(value.fields, visited);
    if (Array.isArray(value.tabs)) {
      for (const tab of value.tabs) {
        if (tab && typeof tab === 'object' && Array.isArray((tab as { fields?: unknown }).fields)) {
          rewriteFields((tab as { fields: unknown[] }).fields, visited);
        }
      }
    }
    const blocks = Array.isArray(value.blockReferences) ? value.blockReferences : value.blocks;

    if (Array.isArray(blocks)) {
      for (const block of blocks) {
        if (
          block &&
          typeof block === 'object' &&
          Array.isArray((block as { fields?: unknown }).fields)
        ) {
          rewriteFields((block as { fields: unknown[] }).fields, visited);
        }
      }
    }
  }
}

export function rewriteComponentPaths(config: SanitizedConfig): SanitizedConfig {
  const visited = new WeakSet<object>();
  const admin = config.admin;
  const bottomRailComponents = admin?.components as BottomRailComponents | undefined;

  for (const key of ['afterBottomRail', 'beforeBottomRail', 'beforeSidebarClose'] as const) {
    const components = bottomRailComponents?.[key];
    if (components) {
      bottomRailComponents[key] = components.map(rewriteComponent);
    }
  }

  const navItems = (admin?.components as { navItems?: { icon?: PayloadComponent }[] } | undefined)
    ?.navItems;
  for (const item of navItems ?? []) {
    if (item.icon) item.icon = rewriteComponent(item.icon);
  }

  if (admin?.dashboard?.widgets) {
    admin.dashboard.widgets = admin.dashboard.widgets.map((widget) => ({
      ...widget,
      Component: rewriteComponent(widget.Component),
    }));

    for (const widget of admin.dashboard.widgets) {
      if (Array.isArray(widget.fields)) rewriteFields(widget.fields, visited);
    }
  }

  if (admin?.dependencies) {
    admin.dependencies = Object.fromEntries(
      Object.entries(admin.dependencies).map(([key, dependency]) => [
        rewritePath(key),
        { ...dependency, path: rewritePath(dependency.path) },
      ]),
    );
  }

  if (admin?.components) {
    admin.components = rewriteComponents(admin.components) as typeof admin.components;
  }

  const settings = (admin as typeof admin & { settings?: SettingsComponents[] })?.settings;
  if (settings) {
    for (const entry of settings) {
      entry.Component = rewriteComponent(entry.Component);
      if (entry.icon) entry.icon = rewriteComponent(entry.icon);
    }
  }

  if (config.collections) {
    for (const collection of config.collections) {
      const collectionAdmin = collection.admin as typeof collection.admin & {
        icon?: PayloadComponent;
      };
      if (collectionAdmin?.icon) collectionAdmin.icon = rewriteComponent(collectionAdmin.icon);
      if (collection.admin?.components) {
        collection.admin.components = rewriteComponents(
          collection.admin.components,
        ) as typeof collection.admin.components;
      }
      if (collection.fields) rewriteFields(collection.fields, visited);
    }
  }

  const blocks = (config as SanitizedConfig & { blocks?: { fields?: unknown[] }[] }).blocks;

  for (const block of blocks ?? []) {
    if (Array.isArray(block.fields)) rewriteFields(block.fields, visited);
  }

  if (config.globals) {
    for (const global of config.globals) {
      const globalAdmin = global.admin as typeof global.admin & { icon?: PayloadComponent };
      if (globalAdmin?.icon) globalAdmin.icon = rewriteComponent(globalAdmin.icon);
      if (global.admin?.components) {
        global.admin.components = rewriteComponents(
          global.admin.components,
        ) as typeof global.admin.components;
      }
      if (global.fields) rewriteFields(global.fields, visited);
    }
  }

  return config;
}
