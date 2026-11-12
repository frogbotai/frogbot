import type {
  CollectionBeforeOperationHook,
  CollectionConfig,
  Endpoint,
  PayloadHandler,
  PayloadRequest,
  TaskConfig,
} from 'payload';
import { addDataAndFileToRequest, executeAccess } from 'payload';

type ExportBody = { collectionSlug?: unknown; drafts?: unknown; [key: string]: unknown };

/**
 * Fixes Payload's export collection. Payload filters exports on `_status` whenever the target has
 * versions, but only collections with drafts have `_status`, so every export of a versioned
 * collection without drafts failed. The download endpoint also streamed from collections the user
 * can't read, and the denial was thrown inside the stream, so the request never answered.
 */
export function withExportFixes(collection: CollectionConfig): CollectionConfig {
  return {
    ...collection,
    endpoints:
      collection.endpoints &&
      collection.endpoints.map((endpoint) => withExportEndpoint(endpoint, collection.slug)),
    hooks: {
      ...collection.hooks,
      beforeOperation: [includeAllVersions, ...(collection.hooks?.beforeOperation ?? [])],
    },
  };
}

/** Normalizes the queued export task's input the same way the collection does. */
export function withExportTaskDrafts(task: TaskConfig): TaskConfig {
  const { handler } = task;

  if (typeof handler !== 'function') return task;

  const withDrafts: typeof handler = (args) =>
    handler({ ...args, input: withoutStatusFilter(args.req, args.input as ExportBody) });

  return { ...task, handler: withDrafts };
}

const includeAllVersions: CollectionBeforeOperationHook = ({ args, operation, req }) => {
  if (operation !== 'create') return args;

  const data = (args as { data?: ExportBody }).data;

  return data ? { ...args, data: withoutStatusFilter(req, data) } : args;
};

function withExportEndpoint(endpoint: Endpoint, exportsSlug: string): Endpoint {
  const { handler, method, path } = endpoint;

  if (method !== 'post') return endpoint;

  if (path === '/download') return { ...endpoint, handler: checkedDownload(handler, exportsSlug) };

  if (path === '/export-preview') return { ...endpoint, handler: previewDrafts(handler) };

  return endpoint;
}

function checkedDownload(handler: PayloadHandler, exportsSlug: string): PayloadHandler {
  return async (req) => {
    const body = typeof req.json === 'function' ? await req.json() : undefined;
    const data = (body as { data?: ExportBody } | undefined)?.data;

    if (!data) return downloadError('Request data is required.', 400);

    const collectionSlug = typeof data.collectionSlug === 'string' ? data.collectionSlug : '';
    const target = req.payload.collections[collectionSlug]?.config;

    const served: string[] | undefined =
      req.payload.collections[exportsSlug]?.config.admin.custom?.['plugin-import-export']
        ?.collectionSlugs;

    if (!target || (served && !served.includes(collectionSlug))) {
      return downloadError(`Collection "${collectionSlug}" can't be exported here.`, 400);
    }

    const allowed = await executeAccess(
      { disableErrors: true, req, slug: collectionSlug },
      target.access.read,
    );

    if (!allowed) return downloadError('You are not allowed to export this collection.', 403);

    const patched = { ...body, data: withoutStatusFilter(req, data) };

    return handler(Object.assign(req, { json: () => Promise.resolve(patched) }));
  };
}

function previewDrafts(handler: PayloadHandler): PayloadHandler {
  return async (req) => {
    await addDataAndFileToRequest(req);

    const data = req.data as { collectionSlug?: unknown; draft?: unknown } | undefined;

    const patched =
      data && !hasDrafts(req, data.collectionSlug) ? { ...data, draft: 'yes' } : (data ?? {});

    return handler(Object.assign(req, { text: () => Promise.resolve(JSON.stringify(patched)) }));
  };
}

function withoutStatusFilter(req: PayloadRequest, data: ExportBody): ExportBody {
  return hasDrafts(req, data.collectionSlug) ? data : { ...data, drafts: 'yes' };
}

function hasDrafts(req: PayloadRequest, collectionSlug: unknown): boolean {
  if (typeof collectionSlug !== 'string') return true;

  const versions = req.payload.collections[collectionSlug]?.config.versions;

  return typeof versions === 'object' && Boolean(versions.drafts);
}

function downloadError(message: string, status: number): Response {
  return Response.json({ errors: [{ message }] }, { status });
}
