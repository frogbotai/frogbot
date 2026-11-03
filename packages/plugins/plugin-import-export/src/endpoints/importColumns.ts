import type { Endpoint, PayloadRequest } from 'payload';

import type { ImportColumn } from '../columns/columnMap.js';
import {
  columnMapFieldName,
  headerKeyFieldName,
  readColumnMap,
  toHeaderKey,
} from '../columns/columnMap.js';
import type { ImportTarget } from '../columns/suggest.js';
import { sanitizeColumns, suggestColumns } from '../columns/suggest.js';
import type { ColumnsRequest } from './request.js';
import { readColumnsRequest } from './request.js';

/** What `import-columns` returns for a chosen file. */
export type ImportColumnsResponse = {
  headers: string[];
  /** Up to 3 values per header, from the top of the file. */
  samples: Record<string, unknown[]>;
  /** The fields a column can import into. */
  targets: ImportTarget[];
  /** The starting mapping, one column per header in file order. */
  columns: ImportColumn[];
  /** `previous`: reused from the latest matching import; `names`: matched by header names. */
  source: 'names' | 'previous';
};

export const importColumnsPath = '/import-columns';

/**
 * `POST /api/<imports>/import-columns` with `{ collectionSlug, fileData, format }`: the file's
 * headers and samples, the target fields, and the starting mapping. The mapping of the latest
 * import of the same collection with the same headers, in any order, that the user can read is
 * reused; otherwise headers are matched to fields by name.
 */
export const importColumnsEndpoint: Endpoint = {
  method: 'post',
  path: importColumnsPath,
  handler: async (req) => {
    const request = await readColumnsRequest(req);

    if ('response' in request) return request.response;

    const { headers, samples, targets, fields } = request;

    const previous = await findPreviousColumns(req, request);

    const response: ImportColumnsResponse = previous
      ? {
          headers,
          samples,
          targets,
          columns: sanitizeColumns({ headers, columns: previous, targets, fields }),
          source: 'previous',
        }
      : {
          headers,
          samples,
          targets,
          columns: suggestColumns({ headers, targets, fields }),
          source: 'names',
        };

    return Response.json(response);
  },
};

async function findPreviousColumns(
  req: PayloadRequest,
  { importsSlug, collectionSlug, headers }: ColumnsRequest,
): Promise<ImportColumn[] | undefined> {
  if (headers.length === 0) return undefined;

  const { docs } = await req.payload.find({
    collection: importsSlug,
    depth: 0,
    limit: 1,
    overrideAccess: false,
    req,
    sort: '-createdAt',
    where: {
      and: [
        { collectionSlug: { equals: collectionSlug } },
        { [headerKeyFieldName]: { equals: toHeaderKey(headers) } },
      ],
    },
  });

  const [latest] = docs as Record<string, unknown>[];

  return readColumnMap(latest?.[columnMapFieldName])?.columns;
}
