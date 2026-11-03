import type { FlattenedField, PayloadRequest } from 'payload';
import { addDataAndFileToRequest, executeAccess } from 'payload';

import type { ImportTarget } from '../columns/suggest.js';
import { listImportTargets } from '../columns/suggest.js';
import type { ImportFileColumns, ImportFormat } from './parseFile.js';
import { readImportFile } from './parseFile.js';

/** The body both column endpoints accept: the chosen file, as the preview sends it. */
export type ImportColumnsBody = {
  collectionSlug?: unknown;
  fileData?: unknown;
  format?: unknown;
};

/** A checked column request: the import collection, its target collection and the parsed file. */
export type ColumnsRequest = ImportFileColumns & {
  importsSlug: string;
  collectionSlug: string;
  fields: FlattenedField[];
  targets: ImportTarget[];
  body: Record<string, unknown>;
};

/**
 * Reads a column endpoint's request. The user must be allowed to create an import, and the target
 * collection must be one this import collection serves. Returns `{ response }` on any failure.
 */
export async function readColumnsRequest(
  req: PayloadRequest,
): Promise<ColumnsRequest | { response: Response }> {
  await addDataAndFileToRequest(req);

  const importsSlug = String(req.routeParams?.collection ?? '');
  const imports = req.payload.collections[importsSlug]?.config;

  if (!imports) return failed('Unknown import collection.', 404);

  const allowed = await executeAccess(
    { disableErrors: true, req, slug: importsSlug },
    imports.access.create,
  );

  if (!allowed) return failed('You are not allowed to import.', 403);

  const body = (req.data ?? {}) as Record<string, unknown> & ImportColumnsBody;

  const served = (imports.admin.custom?.['plugin-import-export'] as { collectionSlugs?: string[] })
    ?.collectionSlugs;

  const collectionSlug = typeof body.collectionSlug === 'string' ? body.collectionSlug : '';
  const collection = req.payload.collections[collectionSlug]?.config;

  if (!collection || (served && !served.includes(collectionSlug))) {
    return failed(`Collection "${collectionSlug}" can't be imported here.`, 400);
  }

  if (typeof body.fileData !== 'string' || body.fileData === '') {
    return failed('No file data provided.', 400);
  }

  const format: ImportFormat = body.format === 'json' ? 'json' : 'csv';

  let file: ImportFileColumns;

  try {
    file = readImportFile(Buffer.from(body.fileData, 'base64'), format);
  } catch (error) {
    return failed(
      `Could not read the file: ${error instanceof Error ? error.message : String(error)}`,
      400,
    );
  }

  return {
    ...file,
    importsSlug,
    collectionSlug,
    fields: collection.flattenedFields,
    targets: listImportTargets(req, collectionSlug),
    body,
  };
}

export function fail(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

function failed(error: string, status: number): { response: Response } {
  return { response: fail(error, status) };
}
