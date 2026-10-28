import type { FrogBotConfig } from './config/types.js';

/** A config transform. `buildConfig` runs plugins by `order`, lowest first. */
export type Plugin = ((config: FrogBotConfig) => FrogBotConfig | Promise<FrogBotConfig>) & {
  /** Options other plugins read through `definePlugin`'s `plugins` map. */
  options?: Record<string, unknown>;
  /** Run order, lowest first. Defaults to `0`; equal orders keep list order. */
  order?: number;
  /** Unique name other plugins find this plugin by. */
  slug?: string;
};

/**
 * Plugin options types keyed by slug. Plugin packages augment it so `plugins[slug].options` is typed.
 *
 * @example
 * declare module 'frogbot' {
 *   interface RegisteredPlugins {
 *     notes: NotesPluginOptions;
 *   }
 * }
 */
export interface RegisteredPlugins {} // eslint-disable-line @typescript-eslint/no-empty-object-type -- plugin packages augment it

/** The app's plugins keyed by slug. Registered slugs have typed `options`. */
export type PluginsMap = {
  [K in keyof RegisteredPlugins]?: { options: RegisteredPlugins[K] } & Plugin;
} & Record<string, Plugin | undefined>;
