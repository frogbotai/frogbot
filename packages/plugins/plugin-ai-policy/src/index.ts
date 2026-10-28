import { type CollectionConfig, definePlugin, getConfiguredModelIds, type Plugin } from 'frogbot';

import { createPolicyAccess } from './access.js';
import { createPolicyFields, mergePolicyFields } from './fields.js';
import { createPolicyHooks } from './hooks.js';
import { createResetTask } from './reset.js';

export type AIPolicyPluginOptions = {
  /** Auth collection that gets the policy fields. Default: the app's only auth collection, or `admin.user`. */
  authCollection?: string;
};

declare module 'frogbot' {
  interface RegisteredPlugins {
    'plugin-ai-policy': AIPolicyPluginOptions;
  }
}

function resolveAuthCollection(
  config: Parameters<Plugin>[0],
  options: AIPolicyPluginOptions,
): string {
  if (options.authCollection) return options.authCollection;

  const authSlugs = config.collections
    .filter((collection) => collection.auth !== undefined && collection.auth !== false)
    .map((collection) => collection.slug);

  if (authSlugs.length === 0) return 'users';
  if (authSlugs.length === 1) return authSlugs[0];
  if (config.admin?.user && authSlugs.includes(config.admin.user)) return config.admin.user;

  throw new Error('[plugin-ai-policy] Set authCollection when multiple auth collections exist.');
}

const aiPolicy = definePlugin<AIPolicyPluginOptions>({
  slug: 'plugin-ai-policy',
  order: 10,
  plugin: ({ config, options }) => {
    if (!config.ai) throw new Error('[plugin-ai-policy] AI configuration is required.');

    const authCollection = resolveAuthCollection(config, options);
    const fields = createPolicyFields(getConfiguredModelIds(config.ai));
    const hooks = createPolicyHooks({ authCollection });
    const hasAuthCollection = config.collections.some(({ slug }) => slug === authCollection);

    const fallback: CollectionConfig = {
      slug: authCollection,
      authorship: false,
      custom: { frogbot: { internal: true } },
      admin: { icon: 'people', useAsTitle: 'name' },
      auth: { tokenExpiration: 7200 },
      fields: [{ name: 'name', type: 'text' }, ...fields],
    };

    return {
      ...config,
      ai: {
        ...config.ai,
        access: createPolicyAccess({ access: config.ai.access, authCollection }),
        hooks: {
          ...config.ai.hooks,
          beforeOperation: [hooks.beforeOperation, ...(config.ai.hooks?.beforeOperation ?? [])],
          afterOperation: [...(config.ai.hooks?.afterOperation ?? []), hooks.afterOperation],
        },
      },
      collections: [
        ...config.collections.map((collection) =>
          collection.slug === authCollection
            ? { ...collection, fields: mergePolicyFields(collection.fields, fields) }
            : collection,
        ),
        ...(hasAuthCollection ? [] : [fallback]),
      ],
      jobs: {
        ...config.jobs,
        tasks: [...(config.jobs?.tasks ?? []), createResetTask({ authCollection })],
      },
    };
  },
});

/**
 * Adds per-user model allowlists, monthly budgets and spend counters to the auth collection,
 * enforced through `ai.access` and AI hooks.
 */
export function aiPolicyPlugin(options: AIPolicyPluginOptions = {}): Plugin {
  return aiPolicy(options);
}
