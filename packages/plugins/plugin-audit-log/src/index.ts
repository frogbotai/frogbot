import { definePlugin, type FrogBotConfig, type Plugin } from 'frogbot';

import { createAuditLogCollection } from './collection.js';
import { createAfterChangeHook, createAfterDeleteHook } from './hooks.js';
import type { AuditCollectionSelection, AuditLogPluginOptions } from './types.js';

export { computeChanges } from './diff.js';
export type {
  AuditCollectionSelection,
  AuditLogPluginOptions,
  AuditOperation,
  AuditSnapshot,
} from './types.js';

type AuditLogResolvedOptions = AuditLogPluginOptions &
  Required<Pick<AuditLogPluginOptions, 'collectionSlug' | 'operations'>>;

declare module 'frogbot' {
  interface RegisteredPlugins {
    'plugin-audit-log': AuditLogResolvedOptions;
  }
}

function userSlug(config: FrogBotConfig): string {
  const authSlugs = config.collections
    .filter((collection) => collection.auth !== undefined && collection.auth !== false)
    .map((collection) => collection.slug);

  if (authSlugs.length === 0) return 'users';
  if (authSlugs.length === 1) return authSlugs[0];
  if (config.admin?.user && authSlugs.includes(config.admin.user)) return config.admin.user;
  throw new Error('[plugin-audit-log] Set admin.user when multiple auth collections exist.');
}

function selected(slug: string, selection: AuditCollectionSelection | undefined): boolean {
  if (!selection) return true;
  if (Array.isArray(selection)) return selection.includes(slug);
  if (selection.include && !selection.include.includes(slug)) return false;

  return !selection.exclude?.includes(slug);
}

const auditLog = definePlugin<AuditLogResolvedOptions>({
  slug: 'plugin-audit-log',
  order: 90,
  plugin: ({ config, options }) => {
    const auditSlug = options.collectionSlug;
    const operations = new Set(options.operations);

    if (config.collections.some((collection) => collection.slug === auditSlug)) {
      throw new Error(`[plugin-audit-log] Collection slug '${auditSlug}' already exists.`);
    }

    const collections = config.collections.map((collection) => {
      if (collection.slug === auditSlug || !selected(collection.slug, options.collections)) {
        return collection;
      }

      const hookOptions = {
        auditSlug,
        collectionSlug: collection.slug,
        ipAddress: options.ipAddress ?? false,
        operations,
        snapshot: options.snapshot ?? 'never',
        trustProxy: options.trustProxy ?? false,
      };

      return {
        ...collection,
        hooks: {
          ...collection.hooks,
          afterChange: [
            ...(collection.hooks?.afterChange ?? []),
            ...(operations.has('create') || operations.has('update')
              ? [createAfterChangeHook(hookOptions)]
              : []),
          ],
          afterDelete: [
            ...(collection.hooks?.afterDelete ?? []),
            ...(operations.has('delete') ? [createAfterDeleteHook(hookOptions)] : []),
          ],
        },
      };
    });

    const auditCollection = createAuditLogCollection({
      slug: auditSlug,
      userSlug: userSlug(config),
      access: options.access,
      ipAddress: options.ipAddress,
    });

    if (!options.retention) return { ...config, collections: [...collections, auditCollection] };
    const retention = options.retention;
    const task: NonNullable<NonNullable<FrogBotConfig['jobs']>['tasks']>[number] = {
      slug: `frogbot-prune-${auditSlug}`,
      interfaceName: `TaskFrogBot-prune-${auditSlug}`,
      schedule: [
        {
          cron: retention.cron ?? '0 0 * * *',
          queue: `frogbot-prune-${auditSlug}`,
        },
      ],
      handler: async ({ req }) => {
        await req.payload.delete({
          collection: auditSlug,
          where: {
            timestamp: {
              less_than: new Date(Date.now() - retention.days * 86_400_000).toISOString(),
            },
          },
          overrideAccess: true,
        });

        return { output: {} };
      },
    };

    return {
      ...config,
      collections: [...collections, auditCollection],
      jobs: { ...config.jobs, tasks: [...(config.jobs?.tasks ?? []), task] },
    };
  },
});

export function auditLogPlugin(options: AuditLogPluginOptions = {}): Plugin {
  const resolved: AuditLogResolvedOptions = {
    ...options,
    collectionSlug: options.collectionSlug ?? 'audit-logs',
    operations: options.operations ?? ['create', 'update', 'delete'],
  };

  if (!resolved.collectionSlug) throw new Error('[plugin-audit-log] collectionSlug is required.');
  if (resolved.operations.length === 0) {
    throw new Error('[plugin-audit-log] operations cannot be empty.');
  }

  if (
    options.retention &&
    (!Number.isInteger(options.retention.days) || options.retention.days < 1)
  ) {
    throw new Error('[plugin-audit-log] retention.days must be a positive integer.');
  }

  return auditLog(resolved);
}
