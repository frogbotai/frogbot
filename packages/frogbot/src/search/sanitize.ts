import type { CollectionConfig } from '../collections/config/types.js';
import type { Field } from '../fields/config/types.js';
import { getEligibleFields, getFieldNodes, type SearchFieldNode } from './getEligibleFields.js';
import type {
  SearchFieldPath,
  SearchFilterField,
  SearchIndexDescriptor,
  SearchIndexDescriptors,
} from './types.js';

type IndexContext = {
  collection: string;
  index: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail({ collection, index }: IndexContext, reason: string): never {
  throw new Error(`[frogbot] Search index '${index}' in collection '${collection}': ${reason}.`);
}

function assertKeys(
  context: IndexContext,
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) fail(context, `${label} does not support '${key}'`);
  }
}

function sanitizePaths(context: IndexContext, value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    return fail(context, `${label} must be a non-empty array of distinct field paths`);
  }

  const paths = new Set<string>();

  for (const path of value) {
    if (
      typeof path !== 'string' ||
      !/^[a-zA-Z_][\w]*(\.[a-zA-Z_][\w]*)*$/.test(path) ||
      paths.has(path)
    ) {
      fail(context, `${label} must contain distinct, valid field paths`);
    }

    paths.add(path);
  }

  return [...paths];
}

function resolveField({
  context,
  mode,
  nodes,
  path,
}: {
  context: IndexContext;
  mode: 'lexical' | 'vector';
  nodes: Map<string, SearchFieldNode[]>;
  path: string;
}): SearchFieldPath & { field: Field } {
  const matches = nodes.get(path);

  if (!matches?.length) fail(context, `${mode} field '${path}' does not exist`);

  if (matches.length !== 1) fail(context, `${mode} field '${path}' is ambiguous`);

  const [{ field, localized, repeated, stored }] = matches;

  if (repeated || ('hasMany' in field && field.hasMany === true)) {
    fail(context, `${mode} field '${path}' must be single-valued`);
  }

  if (!stored) fail(context, `${mode} field '${path}' must be stored and readable`);

  if (mode === 'lexical' ? !['text', 'textarea'].includes(field.type) : field.type !== 'vector') {
    fail(context, `${mode} field '${path}' has an unsupported field type`);
  }

  return { path, localized, field };
}

function sanitizeLexical(
  context: IndexContext,
  value: unknown,
  nodes: Map<string, SearchFieldNode[]>,
): SearchIndexDescriptor['lexical'] {
  if (!isRecord(value)) fail(context, 'lexical must be an object');

  assertKeys(context, value, ['fields', 'language'], 'lexical');

  const fields = sanitizePaths(context, value.fields, 'lexical.fields').map((path) => {
    const resolved = resolveField({ context, mode: 'lexical', nodes, path });

    return { path: resolved.path, localized: resolved.localized };
  });

  if (
    value.language !== undefined &&
    (typeof value.language !== 'string' || !/^[a-z][a-z-]*$/.test(value.language))
  ) {
    fail(context, 'lexical.language must be a non-empty lowercase language name');
  }

  return {
    fields,
    ...(typeof value.language === 'string' ? { language: value.language } : {}),
  };
}

function sanitizeVector(
  context: IndexContext,
  value: unknown,
  nodes: Map<string, SearchFieldNode[]>,
): SearchIndexDescriptor['vector'] {
  if (!isRecord(value)) fail(context, 'vector must be an object');

  assertKeys(context, value, ['field', 'metric'], 'vector');

  if (typeof value.field !== 'string') fail(context, 'vector.field must name a vector field');

  const resolved = resolveField({ context, mode: 'vector', nodes, path: value.field });

  if (resolved.field.type !== 'vector') fail(context, 'vector.field must name a vector field');

  if (!Number.isSafeInteger(resolved.field.dimensions) || resolved.field.dimensions <= 0) {
    fail(context, `vector field '${resolved.path}' requires positive integer dimensions`);
  }

  const metric = value.metric === undefined ? 'cosine' : value.metric;

  if (metric !== 'cosine' && metric !== 'euclidean' && metric !== 'dotProduct') {
    fail(context, 'vector.metric must be cosine, euclidean, or dotProduct');
  }

  return {
    path: resolved.path,
    localized: resolved.localized,
    dimensions: resolved.field.dimensions,
    metric,
  };
}

function sanitizeHybrid(
  context: IndexContext,
  value: unknown,
  modes: { lexical: boolean; vector: boolean },
): SearchIndexDescriptor['hybrid'] {
  if (value === undefined) {
    return modes.lexical && modes.vector
      ? { fusion: 'rrf', weights: { lexical: 1, vector: 1 } }
      : undefined;
  }

  if (!modes.lexical || !modes.vector || !isRecord(value)) {
    fail(context, 'hybrid requires both lexical and vector modes and an options object');
  }

  assertKeys(context, value, ['fusion', 'weights'], 'hybrid');

  if (value.fusion !== undefined && value.fusion !== 'rrf') {
    fail(context, 'hybrid.fusion must be rrf');
  }

  if (value.weights === undefined) {
    return { fusion: 'rrf', weights: { lexical: 1, vector: 1 } };
  }

  if (!isRecord(value.weights)) fail(context, 'hybrid.weights must be an object');

  assertKeys(context, value.weights, ['lexical', 'vector'], 'hybrid.weights');

  const { lexical, vector } = value.weights;

  if (
    typeof lexical !== 'number' ||
    !Number.isFinite(lexical) ||
    lexical <= 0 ||
    typeof vector !== 'number' ||
    !Number.isFinite(vector) ||
    vector <= 0
  ) {
    fail(context, 'hybrid.weights requires positive finite lexical and vector weights');
  }

  return { fusion: 'rrf', weights: { lexical, vector } };
}

function sanitizeFilterFields({
  collection,
  context,
  eligible,
  value,
}: {
  collection: CollectionConfig;
  context: IndexContext;
  eligible: SearchFilterField[];
  value: unknown;
}): SearchFilterField[] {
  if (value === undefined) return eligible;

  if (!isRecord(value)) fail(context, 'filters must be an object');

  assertKeys(context, value, ['fields', 'exclude'], 'filters');

  if (Object.hasOwn(value, 'fields') === Object.hasOwn(value, 'exclude')) {
    fail(context, 'filters must specify exactly one of fields or exclude');
  }

  const required = new Set([
    'id',
    ...(collection.trash ? ['deletedAt'] : []),
    ...(collection.versions && typeof collection.versions === 'object' && collection.versions.drafts
      ? ['_status']
      : []),
  ]);

  const available = new Set(eligible.map(({ path }) => path));
  const subset = Object.hasOwn(value, 'fields');

  const paths = sanitizePaths(
    context,
    subset ? value.fields : value.exclude,
    subset ? 'filters.fields' : 'filters.exclude',
  );

  for (const path of paths) {
    if (!available.has(path)) {
      fail(context, `filter field '${path}' is not eligible stored metadata`);
    }

    if (!subset && required.has(path)) {
      fail(context, `filter field '${path}' is required for visibility`);
    }
  }

  const selected = new Set(paths);

  return eligible.filter(
    ({ path }) => required.has(path) || (subset ? selected.has(path) : !selected.has(path)),
  );
}

function sanitizeSearchIndex({
  collection,
  eligible,
  name,
  nodes,
  value,
}: {
  collection: CollectionConfig;
  eligible: SearchFilterField[];
  name: string;
  nodes: Map<string, SearchFieldNode[]>;
  value: unknown;
}): SearchIndexDescriptor {
  const context = { collection: collection.slug, index: name };

  if (!isRecord(value)) fail(context, 'definition must be an object');

  assertKeys(context, value, ['lexical', 'vector', 'hybrid', 'filters'], 'index');

  if (value.lexical === undefined && value.vector === undefined) {
    fail(context, 'configure lexical and/or vector search');
  }

  const lexical =
    value.lexical === undefined ? undefined : sanitizeLexical(context, value.lexical, nodes);

  const vector =
    value.vector === undefined ? undefined : sanitizeVector(context, value.vector, nodes);

  const hybrid = sanitizeHybrid(context, value.hybrid, {
    lexical: Boolean(lexical),
    vector: Boolean(vector),
  });

  const filterFields = sanitizeFilterFields({
    collection,
    context,
    eligible,
    value: value.filters,
  });

  return {
    name,
    ...(lexical ? { lexical } : {}),
    ...(vector ? { vector } : {}),
    ...(hybrid ? { hybrid } : {}),
    filterFields: Object.fromEntries(filterFields.map((field) => [field.path, field])),
  };
}

export function sanitizeSearchIndexes(
  collection: CollectionConfig,
  { localizeStatus = false }: { localizeStatus?: boolean } = {},
): SearchIndexDescriptors | undefined {
  const definitions: unknown = collection.search;

  if (definitions === undefined) return undefined;

  if (!isRecord(definitions) || Object.keys(definitions).length === 0) {
    fail(
      { collection: collection.slug, index: '(none)' },
      'search must contain at least one named index',
    );
  }

  const nodes = getFieldNodes(collection.fields);

  const drafts =
    collection.versions && typeof collection.versions === 'object'
      ? collection.versions.drafts
      : undefined;

  const eligible = getEligibleFields({
    collection,
    nodes,
    localizeStatus:
      localizeStatus &&
      typeof drafts === 'object' &&
      drafts !== null &&
      drafts.localizeStatus === true,
  });

  const indexes: SearchIndexDescriptors = {};

  for (const [name, value] of Object.entries(definitions)) {
    if (!/^[a-z][a-z0-9_-]*$/.test(name)) {
      fail(
        { collection: collection.slug, index: name },
        'name must be a lowercase search index slug',
      );
    }

    indexes[name] = sanitizeSearchIndex({ collection, eligible, name, nodes, value });
  }

  return indexes;
}
