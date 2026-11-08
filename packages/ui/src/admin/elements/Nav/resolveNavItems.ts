import type { NavItemsArgs, RootAdminComponents } from 'frogbot';
import type { ImportMap, PayloadComponent, SanitizedConfig } from 'payload';
import { parsePayloadComponent } from 'payload/shared';

import { isIconName } from '../../../icons/registry.js';
import type { NavConfigItem } from './buildNavModel.js';

export type ResolveNavItemsArgs = {
  config: SanitizedConfig;
  importMap: ImportMap;
} & NavItemsArgs;

function isMapped(icon: unknown, importMap: ImportMap): boolean {
  if (typeof icon !== 'object' && (typeof icon !== 'string' || !icon.includes('#'))) return false;

  const parsed = parsePayloadComponent(icon as PayloadComponent);

  return Boolean(parsed && importMap[`${parsed.path}#${parsed.exportName}`]);
}

function validateItem(item: unknown, index: number, importMap: ImportMap): NavConfigItem {
  const at = `[frogbot] admin.components.navItems returned an invalid item at index ${index}`;
  const value = item as { icon?: unknown; label?: unknown; path?: unknown } | null;

  if (!value || typeof value.label !== 'string' || !value.label) {
    throw new Error(`${at}: it needs a label.`);
  }

  if (typeof value.path !== 'string' || !value.path) {
    throw new Error(`${at} ('${value.label}'): it needs a path.`);
  }

  const { icon } = value;

  if (icon && !(typeof icon === 'string' && isIconName(icon)) && !isMapped(icon, importMap)) {
    throw new Error(
      `${at} ('${value.label}'): icon ${JSON.stringify(icon)} is neither a built-in icon name nor a component path in the import map.`,
    );
  }

  return value as NavConfigItem;
}

/** The sidebar links for this render: the static `navItems`, or the function's validated result. */
export async function resolveNavItems({
  config,
  importMap,
  ...args
}: ResolveNavItemsArgs): Promise<NavConfigItem[]> {
  const navItems = (config.admin.components as RootAdminComponents | undefined)?.navItems;

  if (typeof navItems !== 'function') return navItems ?? [];

  const items: unknown = await navItems(args);

  if (!Array.isArray(items)) {
    throw new Error('[frogbot] admin.components.navItems must return an array of nav items.');
  }

  return items.map((item, index) => validateItem(item, index, importMap));
}
