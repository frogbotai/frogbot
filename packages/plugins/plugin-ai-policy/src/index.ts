import {
  type CollectionConfig,
  definePlugin,
  type FrogBotConfig,
  getConfiguredModelIds,
  type Plugin,
} from 'frogbot';

import { createPolicyAccess } from './access.js';
import { createPolicyFields, mergePolicyFields } from './fields.js';
import { createPolicyHooks } from './hooks.js';
import { createKeyLimitFields, keyLimitsCreateFields, withKeyLimits } from './keys.js';
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

type Admin = NonNullable<FrogBotConfig['admin']> & {
  dependencies?: Record<string, { path: string; type: 'component' }>;
};

function withCreateFieldsImport(admin: FrogBotConfig['admin']): Admin {
  const current: Admin | undefined = admin;

  return {
    ...current,
    dependencies: {
      ...current?.dependencies,
      [keyLimitsCreateFields]: { path: keyLimitsCreateFields, type: 'component' },
    },
  };
}

const aiPolicy = definePlugin<AIPolicyPluginOptions>({
  slug: 'plugin-ai-policy',
  order: 10,
  plugin: ({ config, options, plugins }) => {
    if (!config.ai) throw new Error('[plugin-ai-policy] AI configuration is required.');

    const authCollection = resolveAuthCollection(config, options);
    const models = getConfiguredModelIds(config.ai);
    const fields = createPolicyFields(models);
    const apiKeys = plugins['plugin-api-keys']?.options as
      { authCollection?: unknown; collectionSlug?: unknown } | undefined;

    const keysCollection =
      apiKeys?.authCollection === authCollection && typeof apiKeys.collectionSlug === 'string'
        ? apiKeys.collectionSlug
        : undefined;

    const hooks = createPolicyHooks({ authCollection, keysCollection });
    const auth = config.collections.find(({ slug }) => slug === authCollection);
    const titleField = auth ? auth.admin?.useAsTitle : 'name';
    const keyFields = keysCollection
      ? createKeyLimitFields({ authCollection, titleField, models })
      : [];

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
        access: createPolicyAccess({ access: config.ai.access, authCollection, keysCollection }),
        hooks: {
          ...config.ai.hooks,
          beforeOperation: [hooks.beforeOperation, ...(config.ai.hooks?.beforeOperation ?? [])],
          afterOperation: [...(config.ai.hooks?.afterOperation ?? []), hooks.afterOperation],
        },
      },
      collections: [
        ...config.collections.map((collection) => {
          if (collection.slug === authCollection) {
            return { ...collection, fields: mergePolicyFields(collection.fields, fields) };
          }

          if (collection.slug === keysCollection) {
            return withKeyLimits(collection, keyFields, { models, titleField });
          }

          return collection;
        }),
        ...(auth ? [] : [fallback]),
      ],
      ...(keysCollection && { admin: withCreateFieldsImport(config.admin) }),
      jobs: {
        ...config.jobs,
        tasks: [...(config.jobs?.tasks ?? []), createResetTask({ authCollection, keysCollection })],
      },
    };
  },
});

/**
 * Adds per-user model allowlists, monthly budgets and spend counters to the auth collection,
 * enforced through `ai.access` and AI hooks. With `apiKeysPlugin()` on the same auth collection,
 * each API key also gets a model list and monthly cap that narrow its owner's.
 */
export function aiPolicyPlugin(options: AIPolicyPluginOptions = {}): Plugin {
  return aiPolicy(options);
}
