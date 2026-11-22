import { readFileSync } from 'node:fs';

import { importExportPlugin as payloadImportExportPlugin } from '@payloadcms/plugin-import-export';
import type {
  ImportBeforeHook,
  ImportExportPluginConfig,
} from '@payloadcms/plugin-import-export/types';
import type { FrogBotConfig } from 'frogbot';
import { definePlugin } from 'frogbot';
import { ConfigIssueError, mapComponentPaths, wrapPayloadPlugin } from 'frogbot/internal';
import type {
  CollectionAfterChangeHook,
  CollectionBeforeOperationHook,
  CollectionConfig,
  Config,
  Endpoint,
  PayloadRequest,
  TaskConfig,
} from 'payload';
import { isolateObjectProperty } from 'payload';

import { columnMapFields } from './columns/columnMap.js';
import { createColumnRewrite, importErrorKey } from './columns/rewrite.js';
import { importColumnsEndpoint } from './endpoints/importColumns.js';
import { suggestColumnsEndpoint } from './endpoints/suggestColumns.js';
import { withExportFixes, withExportTaskDrafts } from './export.js';
import { ImportLookupError } from './relationships.js';

export type { ImportColumn, ImportColumnMap } from './columns/columnMap.js';
export type { ImportMatchByOption, ImportTarget } from './columns/suggest.js';
export type { ImportColumnsResponse } from './endpoints/importColumns.js';
export type { SuggestColumnsResponse } from './endpoints/suggestColumns.js';
export type { RelationshipID, ResolveRelationshipArgs } from './relationships.js';
export { ImportLookupError, resolveRelationship } from './relationships.js';

export type ImportExportPluginOptions = ImportExportPluginConfig;

declare module 'frogbot' {
  interface RegisteredPlugins {
    'plugin-import-export': ImportExportPluginOptions;
  }
}

type CollectionOverride = NonNullable<ImportExportPluginConfig['overrideImportCollection']>;

type PluginCollection = NonNullable<ImportExportPluginConfig['collections']>[number];

type QueueHookKind = 'export' | 'import';

const queueHooks: Record<QueueHookKind, { count: number; index: number }> = {
  export: { count: 1, index: 0 },
  import: { count: 2, index: 1 },
};

export const importExportPlugin = definePlugin<ImportExportPluginOptions>({
  slug: 'plugin-import-export',
  plugin: ({ config, options }) => {
    const imports = importExtras(config, (options.collections?.length ?? 0) > 0);

    const pluginOptions: ImportExportPluginConfig = {
      ...options,
      overrideExportCollection: queueWithRequest({
        kind: 'export',
        path: 'overrideExportCollection',
        override: options.overrideExportCollection,
      }),
      overrideImportCollection: queueWithRequest({
        kind: 'import',
        path: 'overrideImportCollection',
        override: options.overrideImportCollection,
        imports,
      }),
      ...(options.collections && {
        collections: options.collections.map((collection) =>
          withCollectionQueues(collection, imports),
        ),
      }),
    };

    const payloadPlugin = payloadImportExportPlugin(pluginOptions);

    return wrapPayloadPlugin(async (payloadConfig) =>
      withColumnMapping(mapComponentPaths(await payloadPlugin(payloadConfig), toFrogBotPath)),
    )(config);
  },
});

const importTaskSlug = 'createCollectionImport';

const exportTaskSlug = 'createCollectionExport';

const previewFieldName = 'preview';

const pluginKey = 'plugin-import-export';

type ImportTaskInput = { userCollection?: string; userID?: number | string };

function withColumnMapping(config: Config): Config {
  return {
    ...config,
    collections: config.collections?.map(withRowRewrite),
    jobs: config.jobs && {
      ...config.jobs,
      tasks: config.jobs.tasks?.map((task) => {
        if (task.slug === importTaskSlug) return withImportUser(task);

        return task.slug === exportTaskSlug ? withExportTaskDrafts(task) : task;
      }),
    },
  };
}

function withRowRewrite(collection: CollectionConfig): CollectionConfig {
  const custom: { importHooks?: { before?: ImportBeforeHook } } | undefined =
    collection.custom?.[pluginKey];

  if (!custom) return collection;

  const rewrite = createColumnRewrite(collection.slug);
  const appBefore = custom.importHooks?.before;

  const before: ImportBeforeHook = async (args) => {
    const data = await rewrite(args);

    return appBefore ? appBefore({ ...args, data }) : data;
  };

  return {
    ...collection,
    custom: {
      ...collection.custom,
      [pluginKey]: { ...custom, importHooks: { ...custom.importHooks, before } },
    },
    hooks: {
      ...collection.hooks,
      beforeOperation: [rejectImportError, ...(collection.hooks?.beforeOperation ?? [])],
    },
  };
}

const rejectImportError: CollectionBeforeOperationHook = ({ args, operation }) => {
  if (operation !== 'create' && operation !== 'update') return;

  const message = (args as { data?: Record<string, unknown> }).data?.[importErrorKey];

  if (typeof message === 'string') throw new ImportLookupError(message);
};

function withImportUser(task: TaskConfig): TaskConfig {
  const { handler } = task;

  if (typeof handler !== 'function') return task;

  const withUser: typeof handler = async (args) =>
    handler({ ...args, req: await asImportUser(args.req, args.input as ImportTaskInput) });

  return { ...task, handler: withUser };
}

async function asImportUser(
  req: PayloadRequest,
  { userCollection, userID }: ImportTaskInput,
): Promise<PayloadRequest> {
  if (!userCollection || !userID) return req;

  if (req.user?.collection === userCollection && req.user.id === userID) return req;

  const user = await req.payload.findByID({
    collection: userCollection,
    id: userID,
    depth: 0,
    overrideAccess: true,
    req,
  });

  const withUser = isolateObjectProperty(req, 'user');

  withUser.user = { ...user, collection: userCollection } as PayloadRequest['user'];

  return withUser;
}

const payloadSpecifier = '@payloadcms/plugin-import-export/rsc';

function toFrogBotPath(path: string): string {
  return path === payloadSpecifier || path.startsWith(`${payloadSpecifier}#`)
    ? `@frogbotai/plugin-import-export/rsc${path.slice(payloadSpecifier.length)}`
    : path;
}

function withCollectionQueues(
  collection: PluginCollection,
  imports: ImportExtras,
): PluginCollection {
  const { export: exportConfig, import: importConfig } = collection;

  return {
    ...collection,
    ...(typeof exportConfig === 'object' &&
      exportConfig.overrideCollection && {
        export: {
          ...exportConfig,
          overrideCollection: queueWithRequest({
            kind: 'export',
            path: `collections.${collection.slug}.export.overrideCollection`,
            override: exportConfig.overrideCollection,
          }),
        },
      }),
    ...(typeof importConfig === 'object' &&
      importConfig.overrideCollection && {
        import: {
          ...importConfig,
          overrideCollection: queueWithRequest({
            kind: 'import',
            path: `collections.${collection.slug}.import.overrideCollection`,
            override: importConfig.overrideCollection,
            imports,
          }),
        },
      }),
  };
}

type ImportExtras = { ai: boolean; endpoints: Endpoint[] };

function importExtras(config: FrogBotConfig, listCollections: boolean): ImportExtras {
  const ai = Boolean(config.ai?.smallModel ?? config.ai?.defaultModel);
  const columns = importColumnsEndpoint({ listCollections });

  return {
    ai,
    endpoints: ai ? [columns, suggestColumnsEndpoint({ listCollections })] : [columns],
  };
}

type QueueWithRequestProps = {
  kind: QueueHookKind;
  path: string;
  override?: CollectionOverride;
  imports?: ImportExtras;
};

function queueWithRequest({
  kind,
  path,
  override,
  imports,
}: QueueWithRequestProps): CollectionOverride {
  return ({ collection }) => {
    const afterChange = collection.hooks?.afterChange ?? [];
    const { count, index } = queueHooks[kind];

    if (afterChange.length !== count) {
      const option = path.split('.').at(-1);

      throw new ConfigIssueError({
        code: 'IMPORT_EXPORT_HOOKS',
        path: `plugins.importExport.${path}`,
        message: [
          `[plugin-import-export] Expected ${count} afterChange hooks on Payload's ${kind} collection '${collection.slug}', found ${afterChange.length}.`,
          `Your ${option} runs after this check, so it isn't the cause: add your own hooks to the collection it returns.`,
          `The installed @payloadcms/plugin-import-export is a different version than this plugin supports (${supportedPayloadVersion()}): install that version.`,
        ].join(' '),
      });
    }

    const queueHook = afterChange[index];

    const withRequest: CollectionAfterChangeHook = (args) =>
      queueHook({ ...args, req: withQueueRequest(args.req) });

    const queued = {
      ...collection,
      fields: imports ? withColumnMapFields(collection.fields, imports.ai) : collection.fields,
      endpoints: withEndpoints(collection.endpoints, imports?.endpoints ?? []),
      hooks: {
        ...collection.hooks,
        afterChange: afterChange.map((hook, position) => (position === index ? withRequest : hook)),
      },
    };

    const fixed = kind === 'export' ? withExportFixes(queued) : queued;

    return override ? override({ collection: fixed }) : fixed;
  };
}

function withColumnMapFields(
  fields: CollectionConfig['fields'],
  ai: boolean,
): CollectionConfig['fields'] {
  const names = new Set(fields.map((field) => ('name' in field ? field.name : undefined)));

  const added = columnMapFields({ ai }).filter(
    (field) => !names.has((field as { name: string }).name),
  );

  const preview = fields.findIndex((field) => 'name' in field && field.name === previewFieldName);

  return preview === -1
    ? [...fields, ...added]
    : [...fields.slice(0, preview), ...added, ...fields.slice(preview)];
}

function withEndpoints(
  current: CollectionConfig['endpoints'],
  added: Endpoint[],
): CollectionConfig['endpoints'] {
  if (current === false || added.length === 0) return current;

  const paths = new Set((current ?? []).map(({ path }) => path));

  return [...(current ?? []), ...added.filter(({ path }) => !paths.has(path))];
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

function supportedPayloadVersion(): string {
  const payloadPlugin = '@payloadcms/plugin-import-export';

  try {
    const own = readPackage(new URL('../package.json', import.meta.url));
    const pinned = own.dependencies?.[payloadPlugin];

    if (pinned && /^\d/.test(pinned)) return pinned;

    return (
      readPackage(new URL('../package.json', import.meta.resolve(payloadPlugin))).version ?? ''
    );
  } catch {
    return 'see its package.json';
  }
}

function readPackage(url: URL): { version?: string; dependencies?: Record<string, string> } {
  return JSON.parse(readFileSync(url, 'utf8')) as ReturnType<typeof readPackage>;
}
