import { importExportPlugin as payloadImportExportPlugin } from '@payloadcms/plugin-import-export';
import type { ImportExportPluginConfig } from '@payloadcms/plugin-import-export/types';
import type { Plugin } from 'frogbot';
import { wrapPayloadPlugin } from 'frogbot/internal';
import type { CollectionAfterChangeHook, PayloadRequest } from 'payload';

export type ImportExportPluginOptions = ImportExportPluginConfig;

type CollectionOverride = NonNullable<ImportExportPluginConfig['overrideImportCollection']>;

type PluginCollection = NonNullable<ImportExportPluginConfig['collections']>[number];

type QueueHookKind = 'export' | 'import';

const queueHooks: Record<QueueHookKind, { count: number; index: number }> = {
  export: { count: 1, index: 0 },
  import: { count: 2, index: 1 },
};

export function importExportPlugin(options: ImportExportPluginOptions): Plugin {
  const pluginOptions: ImportExportPluginConfig = {
    ...options,
    overrideExportCollection: queueWithRequest('export', options.overrideExportCollection),
    overrideImportCollection: queueWithRequest('import', options.overrideImportCollection),
    ...(options.collections && { collections: options.collections.map(withCollectionQueues) }),
  };

  return wrapPayloadPlugin(payloadImportExportPlugin(pluginOptions));
}

function withCollectionQueues(collection: PluginCollection): PluginCollection {
  const { export: exportConfig, import: importConfig } = collection;

  return {
    ...collection,
    ...(typeof exportConfig === 'object' &&
      exportConfig.overrideCollection && {
        export: {
          ...exportConfig,
          overrideCollection: queueWithRequest('export', exportConfig.overrideCollection),
        },
      }),
    ...(typeof importConfig === 'object' &&
      importConfig.overrideCollection && {
        import: {
          ...importConfig,
          overrideCollection: queueWithRequest('import', importConfig.overrideCollection),
        },
      }),
  };
}

function queueWithRequest(kind: QueueHookKind, override?: CollectionOverride): CollectionOverride {
  return ({ collection }) => {
    const afterChange = collection.hooks?.afterChange ?? [];
    const { count, index } = queueHooks[kind];

    if (afterChange.length !== count) {
      throw new Error(
        `[plugin-import-export] Expected ${count} afterChange hooks on Payload's ${kind} collection '${collection.slug}', found ${afterChange.length}.`,
      );
    }

    const queueHook = afterChange[index];

    const withRequest: CollectionAfterChangeHook = (args) =>
      queueHook({ ...args, req: withQueueRequest(args.req) });

    const queued = {
      ...collection,
      hooks: {
        ...collection.hooks,
        afterChange: afterChange.map((hook, position) => (position === index ? withRequest : hook)),
      },
    };

    return override ? override({ collection: queued }) : queued;
  };
}

function withQueueRequest(req: PayloadRequest): PayloadRequest {
  const { payload } = req;

  const queue = ((args) => payload.jobs.queue({ ...args, req })) as typeof payload.jobs.queue;

  return replace(req, 'payload', replace(payload, 'jobs', replace(payload.jobs, 'queue', queue)));
}

function replace<T extends object, K extends keyof T>(target: T, key: K, value: T[K]): T {
  return new Proxy(target, {
    get: (object, property) => {
      if (property === key) return value;

      const found: unknown = Reflect.get(object, property);

      return typeof found === 'function' ? found.bind(object) : found;
    },
  });
}
