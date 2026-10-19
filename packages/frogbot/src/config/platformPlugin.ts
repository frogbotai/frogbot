// eslint-disable-next-line frogbot/no-imports-from-self -- withFrogBot aliases this exact specifier to the platform's plugin
import platformPlugin from 'frogbot/platform-plugin';

import type { Plugin } from '../plugin.js';

const bundled: Plugin | undefined = platformPlugin;

let registered: Plugin | undefined;

/** Set by `loadConfig`, which runs unbundled, so the `frogbot/platform-plugin` alias never applies. */
export function registerPlatformPlugin(plugin: Plugin): void {
  registered = plugin;
}

export function getPlatformPlugin(): Plugin | undefined {
  return registered ?? bundled;
}
