import type { FlattenedField, PayloadRequest } from 'payload';
import { addDataAndFileToRequest, APIError, executeAccess } from 'payload';

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

/** The `data.code` of every column endpoint failure. */
export type ImportErrorCode =
  | 'ai_model_missing'
  | 'ai_suggestion_failed'
  | 'collection_not_importable'
  | 'file_data_missing'
  | 'file_unreadable'
  | 'import_not_allowed'
  | 'unknown_import_collection'
  | 'unsupported_format';

const formats: ImportFormat[] = ['csv', 'json'];

/** A column endpoint failure, answered by Payload as `{ errors: [{ message, data: { code } }] }`. */
export function importError(
  code: ImportErrorCode,
  message: string,
  status: number,
  extra?: Record<string, unknown>,
): APIError {
  return new APIError(message, status, { code, ...extra }, true);
}

/**
 * Reads a column endpoint's request. The user must be allowed to create an import, the target
 * collection must be one this import collection serves, and `format` must be `csv` (the default)
 * or `json`. Throws an `importError` on any failure.
 */
export async function readColumnsRequest(req: PayloadRequest): Promise<ColumnsRequest> {
  await addDataAndFileToRequest(req);

  const importsSlug = String(req.routeParams?.collection ?? '');
  const imports = req.payload.collections[importsSlug]?.config;

  if (!imports) throw importError('unknown_import_collection', 'Unknown import collection.', 404);

  const allowed = await executeAccess(
    { disableErrors: true, req, slug: importsSlug },
    imports.access.create,
  );

  if (!allowed) throw importError('import_not_allowed', 'You are not allowed to import.', 403);

  const body = (req.data ?? {}) as Record<string, unknown> & ImportColumnsBody;

  const served = (imports.admin.custom?.['plugin-import-export'] as { collectionSlugs?: string[] })
    ?.collectionSlugs;

  const collectionSlug = typeof body.collectionSlug === 'string' ? body.collectionSlug : '';
  const collection = req.payload.collections[collectionSlug]?.config;

  if (!collection || (served && !served.includes(collectionSlug))) {
    const message = `Collection "${collectionSlug}" can't be imported here.`;

    throw served
      ? importError(
          'collection_not_importable',
          `${message} Importable: ${served.join(', ')}.`,
          400,
          { allowed: served },
        )
      : importError('collection_not_importable', message, 400);
  }

  if (typeof body.fileData !== 'string' || body.fileData === '') {
    throw importError(
      'file_data_missing',
      'No file data provided: send the file base64-encoded as `fileData`.',
      400,
    );
  }

  const format = body.format === undefined ? 'csv' : body.format;

  if (!formats.includes(format as ImportFormat)) {
    throw importError(
      'unsupported_format',
      `Unsupported format ${JSON.stringify(format)}. Use "csv" or "json".`,
      400,
      { allowed: formats },
    );
  }

  let file: ImportFileColumns;

  try {
    file = readImportFile(Buffer.from(body.fileData, 'base64'), format as ImportFormat);
  } catch (error) {
    throw importError(
      'file_unreadable',
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
