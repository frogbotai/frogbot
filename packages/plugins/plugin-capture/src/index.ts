import type { Field, Plugin } from 'frogbot';

import { createCapturesCollection } from './collection.js';
import { createCaptureHooks } from './hooks.js';
import { filesystemCaptureStorage } from './storage/filesystem.js';
import type { CapturePluginOptions, CaptureRegistration, CaptureStorage } from './types.js';

export { decodeCapture, encodeCapture } from './blob.js';
export { createCapturesCollection } from './collection.js';
export { filesystemCaptureStorage } from './storage/filesystem.js';
export type {
  CapturePluginOptions,
  CaptureRecord,
  CaptureRegistration,
  CaptureStorage,
} from './types.js';

export const captureConfigKey = 'frogbotCapture';

function validateRate(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`[plugin-capture] ${name} must be between 0 and 1.`);
  }
}

export function capturePlugin(options: CapturePluginOptions = {}): Plugin {
  const collectionSlug = options.collectionSlug ?? 'ai-captures';
  const sampleRate = options.sampleRate ?? 1;
  const maxBodyBytes = options.maxBodyBytes ?? 10 * 1024 * 1024;
  validateRate(sampleRate, 'sampleRate');
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 1) {
    throw new Error('[plugin-capture] maxBodyBytes must be a positive integer.');
  }
  if (
    options.retentionDays !== undefined &&
    (!Number.isInteger(options.retentionDays) || options.retentionDays < 1)
  ) {
    throw new Error('[plugin-capture] retentionDays must be a positive integer.');
  }
  const storage = options.storage ?? filesystemCaptureStorage(options.storageRoot);
  return async (config) => {
    if (!config.ai) throw new Error('[plugin-capture] AI configuration is required.');
    const hooks = createCaptureHooks({
      enabled: options.enabled ?? false,
      sampleRate,
      maxBodyBytes,
      collectionSlug,
      storage,
    });
    const captureFields: Field[] = [
      {
        name: 'capture',
        type: 'select',
        defaultValue: 'inherit',
        options: ['inherit', 'enabled', 'disabled'],
      },
      { name: 'captureSampleRate', type: 'number', min: 0, max: 1 },
    ];
    const collections = config.collections.map((collection) => {
      const names = new Set(
        collection.fields.flatMap((field) => ('name' in field ? [field.name] : [])),
      );
      const apiKeys = names.has('tokenHash') && names.has('prefix');
      return apiKeys
        ? { ...collection, fields: [...collection.fields, ...captureFields] }
        : collection;
    });
    const task = options.retentionDays
      ? {
          slug: 'frogbot-prune-ai-captures',
          schedule: [{ cron: '0 3 * * *', queue: 'frogbot-prune-ai-captures' }],
          handler: async ({ req }: { req: { payload: any } }) => {
            const cutoff = new Date(Date.now() - options.retentionDays! * 86_400_000).toISOString();
            while (true) {
              const result = await req.payload.find({
                collection: collectionSlug,
                where: { requestedAt: { less_than: cutoff } },
                limit: 100,
                sort: 'requestedAt',
                overrideAccess: true,
                req,
              });
              if (!result.docs.length) break;
              for (const doc of result.docs as { id: string | number; blobKey: string }[]) {
                await storage.delete(doc.blobKey);
                await req.payload.delete({
                  collection: collectionSlug,
                  id: doc.id,
                  overrideAccess: true,
                  req,
                });
              }
            }
            return { output: {} };
          },
        }
      : undefined;
    return {
      ...config,
      custom: {
        ...config.custom,
        [captureConfigKey]: { collectionSlug, storage } satisfies CaptureRegistration,
      },
      collections: [...collections, createCapturesCollection(collectionSlug, options.access)],
      jobs: task
        ? { ...config.jobs, tasks: [...(config.jobs?.tasks ?? []), task as never] }
        : config.jobs,
      ai: {
        ...config.ai,
        hooks: {
          ...config.ai.hooks,
          beforeOperation: [
            ...(config.ai.hooks?.beforeOperation ?? []),
            ...(hooks.beforeOperation ?? []),
          ],
          beforeUpstream: [
            ...(hooks.beforeUpstream ?? []),
            ...(config.ai.hooks?.beforeUpstream ?? []),
          ],
          afterUpstream: [
            ...(config.ai.hooks?.afterUpstream ?? []),
            ...(hooks.afterUpstream ?? []),
          ],
          afterError: [...(config.ai.hooks?.afterError ?? []), ...(hooks.afterError ?? [])],
        },
      },
    };
  };
}
