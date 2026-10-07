import type { AdminViewConfig, Config as PayloadConfig } from 'payload';

import type { AttachFrogBot } from '../../config/wrapRequest.js';
import { wrapFieldRequestFunctions } from '../../fields/config/wrapRequestFunctions.js';
import { toPayloadFields } from '../../seams/config.js';
import { isRecord } from '../../utilities/isRecord.js';
import { validateAdminIcon } from '../icons.js';
import type { RootAdminComponents, RootAdminMetaConfig, SettingsEntry } from '../types.js';
import type { DashboardConfig } from '../views/types.js';

export function sanitizeSettings(settings: SettingsEntry[] | undefined): SettingsEntry[] {
  if (settings === undefined) return [];
  if (!Array.isArray(settings)) {
    throw new Error('[frogbot] `settings` must be an array.');
  }

  const paths = new Set<string>();

  return settings.map((entry) => {
    if (!isRecord(entry) || typeof entry.path !== 'string') {
      throw new Error('[frogbot] Every settings entry requires a path.');
    }

    const path = entry.path;
    const segments = path.split('/');
    if (
      !path ||
      path !== path.trim() ||
      path.startsWith('/') ||
      path.includes('\\') ||
      path.includes('?') ||
      path.includes('#') ||
      segments.some((segment) => !segment || segment === '.' || segment === '..')
    ) {
      throw new Error(`[frogbot] Settings path '${path}' must be a normalized relative path.`);
    }

    if (paths.has(path)) {
      throw new Error(`[frogbot] Duplicate settings path '${path}'.`);
    }

    paths.add(path);

    validateAdminIcon(entry.icon);

    return entry;
  });
}

function viewTitleText(title: unknown): string | undefined {
  if (typeof title === 'string') {
    return title === '' ? undefined : title;
  }

  if (typeof title === 'object' && title !== null) {
    const { absolute, default: fallback } = title as { absolute?: unknown; default?: unknown };

    if (typeof absolute === 'string' && absolute !== '') return absolute;

    if (typeof fallback === 'string' && fallback !== '') return fallback;
  }

  return undefined;
}

export function navSections(
  sections: RootAdminComponents['navSections'],
): Pick<RootAdminComponents, 'navSections'> {
  return { navSections: sections ?? ['@frogbotai/next#CollectionsSection'] };
}

type PayloadDashboard = NonNullable<NonNullable<PayloadConfig['admin']>['dashboard']>;

export function wrapDashboard(
  dashboard: DashboardConfig,
  attachFrogBot: AttachFrogBot,
): PayloadDashboard {
  const { defaultLayout, widgets, ...base } = dashboard;
  const rest = {
    ...base,
    widgets: widgets.map(({ fields, ...widget }) => ({
      ...widget,
      ...(fields ? { fields: toPayloadFields(wrapFieldRequestFunctions(fields)) } : {}),
    })),
  };

  if (typeof defaultLayout !== 'function') {
    return { ...rest, ...(defaultLayout ? { defaultLayout } : {}) };
  }

  return {
    ...rest,
    defaultLayout: async ({ req }) => defaultLayout({ req: await attachFrogBot(req) }),
  };
}

export const SETTINGS_VIEW: AdminViewConfig = {
  Component: '@frogbotai/next/views#SettingsView',
  exact: false,
  path: '/settings',
  meta: { title: 'Settings' },
};

export function fillViewMeta(
  view: AdminViewConfig,
  adminMeta: RootAdminMetaConfig,
): AdminViewConfig {
  const meta: RootAdminMetaConfig =
    typeof view.meta === 'object' && view.meta !== null && !Array.isArray(view.meta)
      ? view.meta
      : {};

  const ownText = viewTitleText(meta.title ?? adminMeta.title);
  const own = ownText !== undefined;
  const text = ownText ?? adminMeta.openGraph?.siteName ?? 'FrogBot';
  const restMeta = { ...meta };

  if (!own) delete restMeta.title;

  return {
    ...view,
    meta: {
      ...(own ? {} : { title: text, titleSuffix: meta.titleSuffix ?? '' }),
      ...(meta.description === undefined && adminMeta.description === undefined
        ? { description: text }
        : {}),
      ...(meta.keywords === undefined && adminMeta.keywords === undefined
        ? { keywords: text }
        : {}),
      ...restMeta,
      openGraph: {
        ...(meta.openGraph?.title === undefined && adminMeta.openGraph?.title === undefined
          ? { title: text }
          : {}),
        ...meta.openGraph,
      },
    },
  };
}
