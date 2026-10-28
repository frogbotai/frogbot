import { definePlugin, type Field, type JobsConfig, type Plugin } from 'frogbot';

import { createCapturesCollection } from './collection.js';
import { exportCapturesCommand } from './commands/exportCaptures.js';
import { exportTrainingDataCommand } from './commands/exportTrainingData.js';
import { createCaptureHooks } from './hooks.js';
import { filesystemCaptureStorage } from './storage/filesystem.js';
import type { CapturePluginOptions, CaptureStorage } from './types.js';

export { decodeCapture, encodeCapture } from './blob.js';
export { createCapturesCollection } from './collection.js';
export { filesystemCaptureStorage } from './storage/filesystem.js';
export { exportTrainingData } from './training/exportTrainingData.js';
export type {
  ReadTrainingDataOptions,
  TrainingDataDocument,
  TrainingDataRecord,
} from './training/types.js';
export type { CapturePluginOptions, CaptureRecord, CaptureStorage } from './types.js';

type CaptureResolvedOptions = CapturePluginOptions &
  Required<Pick<CapturePluginOptions, 'collectionSlug' | 'maxBodyBytes' | 'sampleRate'>> & {
    storage: CaptureStorage;
  };

declare module 'frogbot' {
  interface RegisteredPlugins {
    'plugin-capture': CaptureResolvedOptions;
  }
}

function validateRate(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`[plugin-capture] ${name} must be between 0 and 1.`);
  }
}

const capture = definePlugin<CaptureResolvedOptions>({
  slug: 'plugin-capture',
  order: 10,
  plugin: ({ config, options, plugins }) => {
    if (!config.ai) throw new Error('[plugin-capture] AI configuration is required.');

    const { collectionSlug, storage } = options;
    const hooks = createCaptureHooks({
      enabled: options.enabled ?? false,
      sampleRate: options.sampleRate,
      maxBodyBytes: options.maxBodyBytes,
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

    const apiKeysSlug = plugins['plugin-api-keys']?.options?.collectionSlug;

    const collections = config.collections.map((collection) =>
      collection.slug === apiKeysSlug
        ? { ...collection, fields: [...collection.fields, ...captureFields] }
        : collection,
    );

    const task: NonNullable<JobsConfig['tasks']>[number] | undefined = options.retentionDays
      ? {
          slug: 'frogbot-prune-ai-captures',
          interfaceName: 'TaskFrogBotPruneAiCaptures',
          schedule: [{ cron: '0 3 * * *', queue: 'frogbot-prune-ai-captures' }],
          handler: async ({ req }) => {
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
      cli: {
        ...config.cli,
        commands: {
          ...config.cli?.commands,
          'export:captures': exportCapturesCommand({ collectionSlug, storage }),
          'export:training-data': exportTrainingDataCommand,
        },
      },
      collections: [...collections, createCapturesCollection(collectionSlug, options.access)],
      jobs: task ? { ...config.jobs, tasks: [...(config.jobs?.tasks ?? []), task] } : config.jobs,
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
  },
});

export function capturePlugin(options: CapturePluginOptions = {}): Plugin {
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

  return capture({
    ...options,
    collectionSlug: options.collectionSlug ?? 'ai-captures',
    sampleRate,
    maxBodyBytes,
    storage: options.storage ?? filesystemCaptureStorage(options.storageRoot),
  });
}
