import type { FlattenedField, PayloadRequest } from 'payload';
import { addDataAndFileToRequest, executeAccess } from 'payload';

import type { ImportTarget } from '../columns/suggest.js';
import { listImportTargets } from '../columns/suggest.js';
import { importExportError } from '../errors.js';
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

const formats: ImportFormat[] = ['csv', 'json'];

/** How a column endpoint reads its requests. */
export type ColumnsEndpointProps = {
  /** List the served collections in a `import.collection-not-importable` error: only when the plugin's `collections` option limits them. */
  listCollections: boolean;
};

/**
 * Reads a column endpoint's request. The user must be allowed to create an import, the target
 * collection must be one this import collection serves, and `format` must be `csv` (the default)
 * or `json`. Throws an `import.*` error on any failure.
 */
export async function readColumnsRequest(
  req: PayloadRequest,
  { listCollections }: ColumnsEndpointProps,
): Promise<ColumnsRequest> {
  await addDataAndFileToRequest(req);

  const importsSlug = String(req.routeParams?.collection ?? '');
  const imports = req.payload.collections[importsSlug]?.config;

  if (!imports) throw importExportError('import.unknown-collection');

  const allowed = await executeAccess(
    { disableErrors: true, req, slug: importsSlug },
    imports.access.create,
  );

  if (!allowed) throw importExportError('import.not-allowed');

  const body = (req.data ?? {}) as Record<string, unknown> & ImportColumnsBody;

  const served = (imports.admin.custom?.['plugin-import-export'] as { collectionSlugs?: string[] })
    ?.collectionSlugs;

  const collectionSlug = typeof body.collectionSlug === 'string' ? body.collectionSlug : '';
  const collection = req.payload.collections[collectionSlug]?.config;

  if (!collection || (served && !served.includes(collectionSlug))) {
    const message = `Collection "${collectionSlug}" can't be imported here.`;

    throw listCollections && served
      ? importExportError('import.collection-not-importable', {
          detail: `${message} Importable: ${served.join(', ')}.`,
          data: { allowed: served },
        })
      : importExportError('import.collection-not-importable', message);
  }

  if (typeof body.fileData !== 'string' || body.fileData === '') {
    throw importExportError('import.file-data-missing');
  }

  const format = body.format === undefined ? 'csv' : body.format;

  if (!formats.includes(format as ImportFormat)) {
    throw importExportError('import.unsupported-format', {
      detail: `Unsupported format ${JSON.stringify(format)}. Use "csv" or "json".`,
      data: { allowed: formats },
    });
  }

  let file: ImportFileColumns;

  try {
    file = readImportFile(Buffer.from(body.fileData, 'base64'), format as ImportFormat);
  } catch (error) {
    throw importExportError('import.file-unreadable', {
      detail: `Could not read the file: ${error instanceof Error ? error.message : String(error)}`,
      cause: error,
    });
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
