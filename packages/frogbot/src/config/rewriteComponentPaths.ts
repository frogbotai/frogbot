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

export function rewriteComponentPaths(config: SanitizedConfig): SanitizedConfig {
  const admin = config.admin;
  if (!admin) return config;

  if (admin.dashboard?.widgets) {
    admin.dashboard.widgets = admin.dashboard.widgets.map((widget) => ({
      ...widget,
      Component: rewriteComponent(widget.Component),
    }));
  }

  if (admin.dependencies) {
    admin.dependencies = Object.fromEntries(
      Object.entries(admin.dependencies).map(([key, dependency]) => [
        rewritePath(key),
        { ...dependency, path: rewritePath(dependency.path) },
      ]),
    );
  }

  if (admin.components?.providers) {
    admin.components.providers = admin.components.providers.map(rewriteComponent);
  }

  return config;
}
