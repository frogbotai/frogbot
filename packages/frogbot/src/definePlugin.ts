import type { FrogBotConfig } from './config/types.js';
import type { Plugin, PluginsMap } from './plugin.js';

type PluginArgs<TOptions> = { config: FrogBotConfig; options: TOptions; plugins: PluginsMap };

type PluginDescriptor<TOptions> = {
  order?: number;
  plugin: (args: PluginArgs<TOptions>) => FrogBotConfig | Promise<FrogBotConfig>;
  slug: string;
};

function buildPluginsMap(plugins: Plugin[] | undefined): PluginsMap {
  const map: PluginsMap = {};

  for (const plugin of plugins ?? []) {
    if (plugin.slug) map[plugin.slug] = plugin;
  }

  return map;
}

/**
 * Define a plugin with a slug, an order and typed options. The `plugin` callback gets the
 * `config`, the `options` it was called with and the app's other `plugins` keyed by slug.
 *
 * @example
 * export const notesPlugin = definePlugin<NotesPluginOptions>({
 *   slug: 'notes',
 *   plugin: ({ config, options }) => ({ ...config }),
 * });
 */
export function definePlugin(
  descriptor: Omit<PluginDescriptor<undefined>, 'plugin'> & {
    plugin: (
      args: Omit<PluginArgs<undefined>, 'options'>,
    ) => FrogBotConfig | Promise<FrogBotConfig>;
  },
): () => Plugin;
export function definePlugin<TOptions>(
  descriptor: PluginDescriptor<TOptions>,
): undefined extends TOptions ? (options?: TOptions) => Plugin : (options: TOptions) => Plugin;
export function definePlugin<TOptions>(
  descriptor: PluginDescriptor<TOptions>,
): (options: TOptions) => Plugin {
  return (options) => {
    const plugin: Plugin = (config) =>
      descriptor.plugin({ config, options, plugins: buildPluginsMap(config.plugins) });

    plugin.slug = descriptor.slug;

    if (options !== undefined) plugin.options = options as Record<string, unknown>;
    if (descriptor.order !== undefined) plugin.order = descriptor.order;

    return plugin;
  };
}
