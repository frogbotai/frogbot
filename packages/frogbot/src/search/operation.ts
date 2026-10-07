import type { Payload, SanitizedCollectionConfig, Where } from 'payload';
import { createLocalReq, validateQueryPaths } from 'payload';

import type { FrogBot } from '../frogbot.js';
import { fromPayloadFields } from '../seams/config.js';
import { toPayloadRequest } from '../seams/request.js';
import type { CollectionSlug } from '../types/generated.js';
import type { FrogBotRequest } from '../types/request.js';
import {
  describeSearchIndex,
  SearchFilterUnsupportedError,
  SearchReadinessError,
  SearchValidationError,
} from './errors.js';
import { getFieldNodes, type SearchFieldNode } from './getEligibleFields.js';
import { resolveSearchPredicate } from './predicates.js';
import { assertSearchCapability, getSearchAdapter } from './runtime.js';
import { defaultCandidates } from './sanitize.js';
import type {
  SearchComponentRanking,
  SearchHitComponent,
  SearchHitComponents,
  SearchIndexDescriptor,
  SearchManyCollection,
  SearchManyCollectionResult,
  SearchManyOptions,
  SearchManyResult,
  SearchMode,
  SearchOptions,
  SearchQuery,
  SearchRanking,
  SearchResult,
} from './types.js';

type PreparedSearch<T extends CollectionSlug> = {
  options: SearchOptions<T>;
  collection: SanitizedCollectionConfig;
  index: SearchIndexDescriptor;
  query: SearchQuery;
  mode: SearchMode;
  limit: number;
  candidates: number | undefined;
  depth: number;
};

const searchManyCollectionKeys = new Set<string>([
  'candidates',
  'collection',
  'depth',
  'index',
  'select',
  'where',
] satisfies (keyof SearchManyCollection)[]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isComponentRanking(value: unknown): value is SearchComponentRanking {
  return (
    isRecord(value) &&
    typeof value.method === 'string' &&
    typeof value.higherIsBetter === 'boolean' &&
    typeof value.approximate === 'boolean'
  );
}

function getComponentRanking({
  approximate,
  higherIsBetter,
  method,
}: SearchComponentRanking): SearchComponentRanking {
  return { method, higherIsBetter, approximate };
}

function isHitComponent(value: unknown): value is SearchHitComponent {
  return (
    isRecord(value) &&
    typeof value.rank === 'number' &&
    Number.isSafeInteger(value.rank) &&
    value.rank >= 1 &&
    typeof value.score === 'number' &&
    Number.isFinite(value.score)
  );
}

function isHitComponents(value: unknown): value is SearchHitComponents {
  return (
    isRecord(value) &&
    (value.lexical === null || isHitComponent(value.lexical)) &&
    (value.vector === null || isHitComponent(value.vector)) &&
    (value.lexical !== null || value.vector !== null)
  );
}

function getHitComponent(component: SearchHitComponent | null): SearchHitComponent | null {
  return component && { rank: component.rank, score: component.score };
}

function getRankedPaths(index: SearchIndexDescriptor, mode: SearchMode): string[] {
  return [
    ...(mode !== 'vector' ? (index.lexical?.fields.map(({ path }) => path) ?? []) : []),
    ...(mode !== 'lexical' && index.vector ? [index.vector.path] : []),
  ];
}

function getFilterPaths(where: Where): string[] {
  const paths = new Set<string>();

  function visit(predicate: Where): void {
    for (const [path, value] of Object.entries(predicate)) {
      if (path === 'and' || path === 'or') {
        for (const item of value as Where[]) visit(item);

        continue;
      }

      paths.add(path);
    }
  }

  visit(where);

  return [...paths];
}

function isReadGuarded(nodes: Map<string, SearchFieldNode[]>, path: string): boolean {
  return nodes.get(path)?.some(({ readGuarded }) => readGuarded) === true;
}

function getCollectionIndex(
  frogbot: FrogBot,
  collection: string,
  index: string,
): SearchIndexDescriptor | undefined {
  const indexes = frogbot.collections[collection]?.search;

  return indexes && Object.hasOwn(indexes, index) ? indexes[index] : undefined;
}

function prepareSearch<T extends CollectionSlug>(
  frogbot: FrogBot,
  payload: Payload,
  options: SearchOptions<T>,
): PreparedSearch<T> {
  const label = describeSearchIndex(options.collection, options.index);

  const collection: SanitizedCollectionConfig | undefined =
    payload.collections[options.collection]?.config;

  const index = collection && getCollectionIndex(frogbot, options.collection, options.index);

  if (!collection || !index) {
    throw new SearchValidationError(`${label} is not configured.`);
  }

  const input: unknown = options.query;

  if (
    !isRecord(input) ||
    Object.keys(input).some((key) => key !== 'text' && key !== 'vector') ||
    (input.text === undefined && input.vector === undefined)
  ) {
    throw new SearchValidationError(`${label} requires text and/or vector query input.`);
  }

  if (input.text !== undefined && (typeof input.text !== 'string' || !input.text.trim())) {
    throw new SearchValidationError(`${label} requires non-empty query text.`);
  }

  if (input.vector !== undefined) {
    const dimensions = index.vector?.dimensions;

    if (dimensions === undefined) {
      throw new SearchValidationError(`${label} does not configure vector search.`);
    }

    if (
      !Array.isArray(input.vector) ||
      input.vector.length !== dimensions ||
      input.vector.some((value) => typeof value !== 'number' || !Number.isFinite(value))
    ) {
      throw new SearchValidationError(
        `${label} requires a vector of ${dimensions} finite numbers.`,
      );
    }
  }

  const query: SearchQuery = {
    ...(input.text === undefined ? {} : { text: input.text }),
    ...(input.vector === undefined ? {} : { vector: input.vector as number[] }),
  };

  const mode: SearchMode =
    query.text !== undefined ? (query.vector !== undefined ? 'hybrid' : 'lexical') : 'vector';

  if (!index[mode]) {
    throw new SearchValidationError(`${label} does not configure ${mode} search.`);
  }

  const limit = options.limit ?? 10;

  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new SearchValidationError(`${label} requires a positive integer limit.`);
  }

  if (
    options.candidates !== undefined &&
    (!Number.isSafeInteger(options.candidates) || options.candidates < 1)
  ) {
    throw new SearchValidationError(`${label} requires a positive integer candidates count.`);
  }

  const candidates =
    mode === 'lexical'
      ? undefined
      : Math.max(limit, options.candidates ?? index.defaultCandidates ?? defaultCandidates);

  const depth = options.depth ?? 0;

  if (!Number.isSafeInteger(depth) || depth < 0) {
    throw new SearchValidationError(`${label} requires a non-negative integer depth.`);
  }

  if (options.select !== undefined && !isRecord(options.select)) {
    throw new SearchValidationError(`${label} requires an object select.`);
  }

  if (options.draft !== undefined && typeof options.draft !== 'boolean') {
    throw new SearchValidationError(`${label} requires a boolean draft option.`);
  }

  if (options.overrideAccess !== undefined && typeof options.overrideAccess !== 'boolean') {
    throw new SearchValidationError(`${label} requires a boolean overrideAccess option.`);
  }

  if (options.locale === 'all' || options.locale === '*' || options.req?.locale === 'all') {
    throw new SearchFilterUnsupportedError(`${label} requires one locale per ranked result.`);
  }

  return { options, collection, index, query, mode, limit, candidates, depth };
}

async function createSearchRequest(
  frogbot: FrogBot,
  payload: Payload,
  {
    fallbackLocale,
    locale,
    overrideAccess,
    req,
  }: Pick<SearchOptions, 'fallbackLocale' | 'locale' | 'overrideAccess' | 'req'>,
): Promise<FrogBotRequest> {
  if (overrideAccess !== true && !req) {
    throw new SearchValidationError('Search requires req unless overrideAccess: true is explicit.');
  }

  const payloadReq = await createLocalReq(
    {
      req: toPayloadRequest(req ?? (await frogbot.createRequest())),
      locale,
      fallbackLocale,
    },
    payload,
  );

  return Object.assign(payloadReq, { frogbot });
}

async function runSearch<T extends CollectionSlug>(
  payload: Payload,
  { candidates, collection, depth, index, limit, mode, options, query }: PreparedSearch<T>,
  req: FrogBotRequest,
): Promise<SearchResult<T>> {
  const label = describeSearchIndex(collection.slug, index.name);

  if (req.locale === 'all') {
    throw new SearchFilterUnsupportedError(`${label} requires one locale per ranked result.`);
  }

  const payloadReq = toPayloadRequest(req);
  const overrideAccess = options.overrideAccess === true;
  const draft = options.draft === true;

  const nodes = overrideAccess ? undefined : getFieldNodes(fromPayloadFields(collection.fields));

  if (nodes && getRankedPaths(index, mode).some((path) => isReadGuarded(nodes, path))) {
    throw new SearchFilterUnsupportedError(
      `${label} cannot verify conditional visibility of ranked fields.`,
    );
  }

  const where = await resolveSearchPredicate({
    collection,
    index,
    where: options.where,
    req,
    overrideAccess,
    draft,
  });

  if (nodes) {
    if (getFilterPaths(where).some((path) => isReadGuarded(nodes, path))) {
      throw new SearchFilterUnsupportedError(
        `${label} cannot filter a field with document-dependent read access.`,
      );
    }

    if (options.where) {
      try {
        await validateQueryPaths({
          collectionConfig: collection,
          overrideAccess: false,
          req: payloadReq,
          where: options.where,
        });
      } catch {
        throw new SearchFilterUnsupportedError(`${label} cannot authorize the requested filters.`);
      }
    }
  }

  const adapter = getSearchAdapter(payload.db);

  assertSearchCapability({ adapter, collection: collection.slug, db: payload.db, index, mode });

  await adapter!.readiness?.({
    collection: collection.slug,
    db: payload.db,
    draft,
    index,
    mode,
  });

  const result = await adapter!.search({
    candidates,
    collection: collection.slug,
    db: payload.db,
    draft,
    fallbackLocale: payloadReq.fallbackLocale,
    index,
    limit,
    locale: payloadReq.locale,
    mode,
    query,
    req: payloadReq,
    where,
  });

  const invalidResult = () =>
    new SearchReadinessError(`${label} returned an invalid ranked result.`);

  if (
    !result ||
    !Array.isArray(result.rows) ||
    result.rows.length > limit ||
    !isComponentRanking(result.ranking) ||
    (mode === 'hybrid' &&
      (!isRecord(result.ranking.components) ||
        !isComponentRanking(result.ranking.components.lexical) ||
        !isComponentRanking(result.ranking.components.vector)))
  ) {
    throw invalidResult();
  }

  const { approximate, higherIsBetter, method } = result.ranking;

  const ranking: SearchRanking = {
    method,
    higherIsBetter,
    approximate,
    ...(mode === 'hybrid'
      ? {
          components: {
            lexical: getComponentRanking(result.ranking.components!.lexical),
            vector: getComponentRanking(result.ranking.components!.vector),
          },
        }
      : {}),
  };

  const seen = new Set<string>();

  for (const row of result.rows) {
    if (
      !row ||
      (typeof row.id !== 'number' && typeof row.id !== 'string') ||
      seen.has(String(row.id)) ||
      typeof row.score !== 'number' ||
      !Number.isFinite(row.score) ||
      (mode === 'hybrid' && !isHitComponents(row.components))
    ) {
      throw invalidResult();
    }

    seen.add(String(row.id));
  }

  if (!result.rows.length) return { mode, ranking, hits: [] };

  const { docs } = await payload.find({
    collection: options.collection,
    where: { and: [where, { id: { in: result.rows.map(({ id }) => id) } }] },
    limit: result.rows.length,
    pagination: false,
    depth,
    draft,
    disableErrors: true,
    fallbackLocale: options.fallbackLocale,
    locale: options.locale,
    overrideAccess,
    req: payloadReq,
    select: options.select,
  });

  const docsByID = new Map(docs.map((doc) => [String(doc.id), doc]));

  const hits = result.rows.flatMap(({ components, id, score }) => {
    const doc = docsByID.get(String(id));

    if (!doc) return [];

    return [
      mode === 'hybrid'
        ? {
            doc,
            score,
            components: {
              lexical: getHitComponent(components!.lexical),
              vector: getHitComponent(components!.vector),
            },
          }
        : { doc, score },
    ];
  });

  return { mode, ranking, hits };
}

function assertSearchManyCollections(
  value: unknown,
): asserts value is readonly SearchManyCollection[] {
  if (!Array.isArray(value) || !value.length) {
    throw new SearchValidationError('Search requires a non-empty collections list.');
  }

  const collections = new Set<unknown>();

  for (const entry of value) {
    if (!isRecord(entry)) {
      throw new SearchValidationError('Search requires every collections entry to be an object.');
    }

    if (typeof entry.collection !== 'string' || typeof entry.index !== 'string') {
      throw new SearchValidationError(
        'Search requires a collection and an index on every collections entry.',
      );
    }

    const key = Object.keys(entry).find((name) => !searchManyCollectionKeys.has(name));

    if (key !== undefined) {
      const label = describeSearchIndex(String(entry.collection), String(entry.index));

      throw new SearchValidationError(`${label} does not accept a per-collection '${key}' option.`);
    }

    if (collections.has(entry.collection)) {
      throw new SearchValidationError(
        `Search lists collection '${String(entry.collection)}' more than once.`,
      );
    }

    collections.add(entry.collection);
  }
}

export async function searchOperation<T extends CollectionSlug>(
  frogbot: FrogBot,
  payload: Payload,
  options: SearchOptions<T>,
): Promise<SearchResult<T>> {
  const prepared = prepareSearch(frogbot, payload, options);

  const req = await createSearchRequest(frogbot, payload, options);

  return runSearch(payload, prepared, req);
}

export async function searchManyOperation<const C extends readonly CollectionSlug[]>(
  frogbot: FrogBot,
  payload: Payload,
  options: SearchManyOptions<C>,
): Promise<SearchManyResult<C>> {
  const { collections, draft, fallbackLocale, limit, locale, overrideAccess, query, req } = options;
  const shared = { draft, fallbackLocale, limit, locale, overrideAccess, query, req };

  const entries: unknown = collections;

  assertSearchManyCollections(entries);

  const searches = entries.map((entry) => prepareSearch(frogbot, payload, { ...entry, ...shared }));

  const request = await createSearchRequest(frogbot, payload, shared);

  const results: SearchManyCollectionResult[] = [];

  for (const prepared of searches) {
    const { hits, mode, ranking } = await runSearch(payload, prepared, request);

    results.push({ collection: prepared.options.collection, mode, ranking, hits });
  }

  const result: SearchManyResult = { results };

  return result as SearchManyResult<C>;
}
