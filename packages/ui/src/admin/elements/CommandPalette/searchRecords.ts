import * as qs from 'qs-esm';

import type { PaletteCollection } from './buildPaletteModel.js';

export const RECORD_LIMIT = 5;

export type RecordRequest = {
  init: RequestInit;
  kind: 'contains' | 'index';
  url: string;
};

export type RecordResult = {
  id: number | string;
  title: string;
};

export type BuildRecordRequestsProps = {
  apiRoute: string;
  collection: PaletteCollection;
  text: string;
};

export type SearchCollectionProps = BuildRecordRequestsProps & {
  fetch: typeof globalThis.fetch;
  signal?: AbortSignal;
};

type RecordDoc = Record<string, unknown> & { id: number | string };

/** Builds a collection's "contains" request and, when it has a lexical index, its index request. */
export function buildRecordRequests({
  apiRoute,
  collection,
  text,
}: BuildRecordRequestsProps): RecordRequest[] {
  const query = text.trim();

  if (!query) return [];

  const base = `${apiRoute.replace(/\/+$/, '')}/${encodeURIComponent(collection.slug)}`;
  const select = { [collection.titleField]: true };

  const contains: RecordRequest = {
    init: { method: 'GET' },
    kind: 'contains',
    url: `${base}?${qs.stringify({
      depth: 0,
      limit: RECORD_LIMIT,
      select,
      where: { or: collection.searchFields.map((field) => ({ [field]: { like: query } })) },
    })}`,
  };

  if (!collection.index) return [contains];

  return [
    contains,
    {
      init: {
        body: JSON.stringify({
          index: collection.index,
          limit: RECORD_LIMIT,
          query: { text: query },
          select,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
      kind: 'index',
      url: `${base}/search`,
    },
  ];
}

async function fetchDocs(
  fetch: typeof globalThis.fetch,
  request: RecordRequest,
  signal?: AbortSignal,
): Promise<RecordDoc[]> {
  const response = await fetch(request.url, { ...request.init, signal });

  if (!response.ok) throw new Error(`${request.url} failed with ${response.status}`);

  const body = (await response.json()) as { docs?: RecordDoc[]; hits?: { doc: RecordDoc }[] };

  return request.kind === 'index' ? (body.hits ?? []).map(({ doc }) => doc) : (body.docs ?? []);
}

function toResult(doc: RecordDoc, titleField: string): RecordResult {
  const value = doc[titleField];
  const title = typeof value === 'string' || typeof value === 'number' ? String(value) : '';

  return { id: doc.id, title: title || String(doc.id) };
}

/**
 * Runs a collection's record requests in parallel and merges "contains" matches first, then index
 * hits not already listed, up to the limit. Rejects only when every request fails.
 */
export async function searchCollection({
  fetch,
  signal,
  ...props
}: SearchCollectionProps): Promise<RecordResult[]> {
  const requests = buildRecordRequests(props);

  if (!requests.length) return [];

  const settled = await Promise.allSettled(
    requests.map((request) => fetchDocs(fetch, request, signal)),
  );

  signal?.throwIfAborted();

  const failed = settled.find((result) => result.status === 'rejected');

  if (failed && settled.every((result) => result.status === 'rejected')) throw failed.reason;

  const results = new Map<string, RecordResult>();

  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;

    for (const doc of result.value) {
      const key = String(doc.id);

      if (results.size < RECORD_LIMIT && !results.has(key)) {
        results.set(key, toResult(doc, props.collection.titleField));
      }
    }
  }

  return [...results.values()];
}
