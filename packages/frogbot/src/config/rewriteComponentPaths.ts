import type { PayloadComponent, SanitizedConfig } from 'payload';

function rewritePath(path: string): string {
  if (path.startsWith('@payloadcms/next/rsc#') || path.startsWith('@payloadcms/next/client#')) {
    return path.replace('@payloadcms/next/', '@frogbotai/next/');
  }
  if (path.startsWith('@payloadcms/storage-')) {
    return path.replace('@payloadcms/', '@frogbotai/');
  }
  return path;
}

function rewriteComponent<T extends PayloadComponent>(component: T): T {
  if (typeof component === 'string') {
    return rewritePath(component) as T;
  }
  if (component && typeof component === 'object' && typeof component.path === 'string') {
    return { ...component, path: rewritePath(component.path) };
  }
  return component;
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

function rewriteFields(fields: unknown[]): void {
  for (const field of fields) {
    if (!field || typeof field !== 'object') continue;
    const value = field as Record<string, unknown>;
    const admin = value.admin as { components?: unknown } | undefined;
    if (admin?.components) admin.components = rewriteComponents(admin.components);
    if (Array.isArray(value.fields)) rewriteFields(value.fields);
    if (Array.isArray(value.tabs)) {
      for (const tab of value.tabs) {
        if (tab && typeof tab === 'object' && Array.isArray((tab as { fields?: unknown }).fields)) {
          rewriteFields((tab as { fields: unknown[] }).fields);
        }
      }
    }
    if (Array.isArray(value.blocks)) {
      for (const block of value.blocks) {
        if (block && typeof block === 'object' && Array.isArray((block as { fields?: unknown }).fields)) {
          rewriteFields((block as { fields: unknown[] }).fields);
        }
      }
    }
  }
}

export function rewriteComponentPaths(config: SanitizedConfig): SanitizedConfig {
  const admin = config.admin;

  if (admin?.dashboard?.widgets) {
    admin.dashboard.widgets = admin.dashboard.widgets.map((widget) => ({
      ...widget,
      Component: rewriteComponent(widget.Component),
    }));
  }

  if (admin?.dependencies) {
    admin.dependencies = Object.fromEntries(
      Object.entries(admin.dependencies).map(([key, dependency]) => [
        rewritePath(key),
        { ...dependency, path: rewritePath(dependency.path) },
      ]),
    );
  }

  if (admin?.components) admin.components = rewriteComponents(admin.components) as typeof admin.components;

  if (config.collections) {
    for (const collection of config.collections) {
      if (collection.admin?.components) {
        collection.admin.components = rewriteComponents(collection.admin.components) as typeof collection.admin.components;
      }
      if (collection.fields) rewriteFields(collection.fields);
    }
  }

  return config;
}
