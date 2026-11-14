import type {
  AccessResult,
  Collection,
  Payload,
  PayloadRequest,
  SanitizedCollectionConfig,
  Where,
} from 'payload';
import {
  appendVersionToQueryKey,
  createPayloadRequest,
  executeAccess,
  Forbidden,
  QueryError,
  validateQueryPaths,
} from 'payload';

import type { FrogBot } from '../frogbot.js';
import { toFrogBotRequest, toPayloadRequest } from '../seams/request.js';
import type { CollectionSlug } from '../types/generated.js';
import { AggregateValidationError, describeAggregate } from './errors.js';
import {
  type AggregateFieldHop,
  getWherePaths,
  resolveAggregateField,
  type ResolvedAggregateField,
} from './resolveField.js';
import {
  getAggregatePage,
  getEmptyAggregate,
  getEmptyTotals,
  toAggregateValue,
  toGroupKey,
} from './results.js';
import { getAggregateAdapter } from './runtime.js';
import type {
  AggregateGroupDescriptor,
  AggregateOptions,
  AggregateResult,
  AggregateSortDescriptor,
  AggregateValueDescriptor,
  AggregateValues,
} from './types.js';
import { assertAggregateKeys, parseAggregateOptions, type ParsedAggregate } from './validate.js';

type ResolvedGroup = AggregateGroupDescriptor & {
  hops: AggregateFieldHop[];
  relationTo?: string;
};

type Scope = {
  collection: SanitizedCollectionConfig;
  label: string;
  overrideAccess: boolean;
  payload: Payload;
  req: PayloadRequest;
};

async function createAggregateRequest(
  frogbot: FrogBot,
  payload: Payload,
  { context, fallbackLocale, locale, overrideAccess, req }: AggregateOptions,
): Promise<PayloadRequest> {
  if (overrideAccess !== true && !req) {
    throw new AggregateValidationError(
      'Aggregate requires req unless overrideAccess: true is explicit.',
    );
  }

  const payloadReq = await createPayloadRequest({
    payload,
    req: toPayloadRequest(req ?? (await frogbot.createRequest())),
    context,
    locale,
    fallbackLocale,
  });

  return toPayloadRequest(toFrogBotRequest(payloadReq, frogbot));
}

function resolve(scope: Scope, path: string): ResolvedAggregateField {
  const resolved = resolveAggregateField({
    collection: scope.collection,
    path,
    payload: scope.payload,
  });

  if (!resolved) throw new AggregateValidationError(`${scope.label} has no field '${path}'.`);

  if (resolved.hidden) throw new Forbidden(scope.req.t);

  return resolved;
}

function isReadGuarded(scope: Scope, { readGuarded }: ResolvedAggregateField): boolean {
  return readGuarded && !scope.overrideAccess;
}

function resolveGroups(scope: Scope, { groupBy }: ParsedAggregate): ResolvedGroup[] {
  const groups: ResolvedGroup[] = [];

  for (const { by, path } of groupBy) {
    const resolved = resolve(scope, path);
    const { field, hops, type } = resolved;

    if (!type) {
      throw new AggregateValidationError(
        `${scope.label} cannot group by '${path}': its field type has no single stored value.`,
      );
    }

    if (by && type !== 'date') {
      throw new AggregateValidationError(
        `${scope.label} cannot group '${path}' by ${by}: it is not a date field.`,
      );
    }

    const relationTo =
      (field.type === 'relationship' || field.type === 'upload') &&
      typeof field.relationTo === 'string'
        ? field.relationTo
        : undefined;

    if (isReadGuarded(scope, resolved)) throw new Forbidden(scope.req.t);

    groups.push({ path, type, hops, ...(by ? { by } : {}), ...(relationTo ? { relationTo } : {}) });
  }

  return groups;
}

function resolveValues(
  scope: Scope,
  { values }: ParsedAggregate,
): (AggregateValueDescriptor | null)[] {
  const resolved: (AggregateValueDescriptor | null)[] = [];

  for (const { name, operation, path } of values) {
    if (operation === 'count' || !path) {
      resolved.push({ operation: 'count' });

      continue;
    }

    const target = resolve(scope, path);
    const { hops, many, type } = target;

    if (hops.length || many) {
      throw new AggregateValidationError(
        `${scope.label} cannot ${operation} '${path}' for value '${name}': it must hold one value per document.`,
      );
    }

    if (type !== 'number' && (type !== 'date' || operation === 'sum' || operation === 'avg')) {
      throw new AggregateValidationError(
        `${scope.label} cannot ${operation} '${path}' for value '${name}': ${
          operation === 'sum' || operation === 'avg'
            ? 'it needs a number field'
            : 'it needs a number or date field'
        }.`,
      );
    }

    resolved.push(isReadGuarded(scope, target) ? null : { operation, path, type });
  }

  return resolved;
}

function getColumns(values: (AggregateValueDescriptor | null)[]): number[] {
  let next = 0;

  return values.map((value) => (value ? next++ : -1));
}

function getSort(
  { sort, values }: ParsedAggregate,
  groups: ResolvedGroup[],
  columns: number[],
): AggregateSortDescriptor[] {
  const descriptors = sort.flatMap(({ direction, name }): AggregateSortDescriptor[] => {
    const group = groups.findIndex(({ path }) => path === name);

    if (group !== -1) return [{ target: 'group', index: group, direction }];

    const index = columns[values.findIndex((value) => value.name === name)] ?? -1;

    return index === -1 ? [] : [{ target: 'value', index, direction }];
  });

  for (const [index] of groups.entries()) {
    if (!descriptors.some((item) => item.target === 'group' && item.index === index)) {
      descriptors.push({ target: 'group', index, direction: 'asc' });
    }
  }

  return descriptors;
}

function toVersionPath(path: string): string {
  return path === 'id' ? 'parent' : `version.${path}`;
}

function prefixWhere(prefix: string, where: Where): Where {
  return Object.fromEntries(
    Object.entries(where).map(([key, value]) =>
      ['and', 'or'].includes(key.toLowerCase()) && Array.isArray(value)
        ? [key, value.map((item: Where) => prefixWhere(prefix, item))]
        : [`${prefix}.${key}`, value],
    ),
  );
}

async function getRelatedAccess(
  scope: Scope,
  groups: ResolvedGroup[],
): Promise<{ clauses: Where[]; denied?: string }> {
  const accessByCollection = new Map<string, AccessResult>();
  const clauses: Where[] = [];

  for (const { hops, path } of groups) {
    for (const [index, { collection, many, prefix }] of hops.entries()) {
      if (!accessByCollection.has(collection)) {
        const access = await executeAccess(
          { slug: collection, disableErrors: true, req: scope.req },
          scope.payload.collections[collection].config.access.read,
        );

        accessByCollection.set(collection, access);
      }

      const access = accessByCollection.get(collection);

      if (access === false || (many && typeof access === 'object')) {
        return { clauses, denied: path };
      }

      if (typeof access === 'object') {
        const missing = hops
          .slice(0, index + 1)
          .map((hop): Where => ({ [hop.prefix]: { exists: false } }));

        clauses.push({ or: [...missing, prefixWhere(prefix, access)] });
      }
    }
  }

  return { clauses };
}

async function populateGroups({
  depth,
  groups,
  options,
  rows,
  scope,
}: {
  depth: number;
  groups: ResolvedGroup[];
  options: AggregateOptions;
  rows: AggregateResult['groups'];
  scope: Scope;
}): Promise<void> {
  for (const { path, relationTo } of groups) {
    if (!relationTo) continue;

    const ids = [...new Set(rows.map(({ group }) => group[path]).filter((id) => id !== null))] as (
      number | string
    )[];

    if (!ids.length) continue;

    const { docs } = await scope.payload.find({
      collection: relationTo,
      where: { id: { in: ids } },
      depth: depth - 1,
      draft: false,
      disableErrors: true,
      overrideAccess: scope.overrideAccess,
      pagination: false,
      populate: options.populate,
      req: scope.req,
      select: options.populate?.[relationTo],
    });

    const docsByID = new Map(docs.map((doc) => [String(doc.id), doc]));

    for (const { group } of rows) {
      const doc = group[path] === null ? undefined : docsByID.get(String(group[path]));

      if (doc) group[path] = doc;
    }
  }
}

/** Totals per group over the documents the request can read, on any database. */
export async function aggregateOperation<
  T extends CollectionSlug,
  const V extends AggregateValues<T>,
>(
  frogbot: FrogBot,
  payload: Payload,
  incoming: AggregateOptions<T, V>,
): Promise<AggregateResult<T, V>> {
  const input: unknown = incoming;

  assertAggregateKeys(input);

  const entity: Collection | undefined = payload.collections[input.collection];

  if (!entity) {
    throw new AggregateValidationError(
      `${describeAggregate(String(input.collection))} cannot run: the collection does not exist.`,
    );
  }

  const collection = entity.config;
  const parsed = parseAggregateOptions(input);
  const req = await createAggregateRequest(frogbot, payload, input);
  const label = describeAggregate(collection.slug);
  const adapter = getAggregateAdapter(payload.db, collection.slug);
  const scope: Scope = { collection, label, overrideAccess: parsed.overrideAccess, payload, req };

  const access = parsed.overrideAccess
    ? true
    : await executeAccess(
        { slug: collection.slug, disableErrors: parsed.disableErrors, req },
        collection.access.read,
      );

  const empty = (denied: ReadonlySet<string> = new Set()) =>
    (parsed.groupBy.length
      ? getEmptyAggregate(parsed.limit)
      : getAggregatePage({
          groups: [getEmptyTotals(parsed.values, denied)],
          limit: undefined,
          page: 1,
          totalDocs: 1,
        })) as AggregateResult<T, V>;

  if (access === false) return empty();

  const clauses: Where[] = [];

  if (parsed.where) clauses.push(parsed.where);

  if (typeof access === 'object') clauses.push(access);

  if (collection.trash && !parsed.trash) clauses.push({ deletedAt: { exists: false } });

  const versions = Boolean(collection.versions?.drafts && parsed.draft);

  if (collection.versions?.drafts && !parsed.draft) {
    clauses.push({ _status: { equals: 'published' } });
  }

  for (const path of getWherePaths(parsed.where)) {
    const field = resolveAggregateField({ collection, path, payload });

    if (field?.hidden && !parsed.overrideAccess) {
      throw new Forbidden(req.t);
    }
  }

  await validateQueryPaths({
    collectionConfig: collection,
    overrideAccess: parsed.overrideAccess,
    req,
    where: parsed.where ?? {},
  });

  const groups = resolveGroups(scope, parsed);
  const values = resolveValues(scope, parsed);
  const columns = getColumns(values);
  const readable = values.filter((value) => value !== null);
  const denied = new Set(
    parsed.values.filter((_, index) => !values[index]).map(({ name }) => name),
  );

  if (!parsed.overrideAccess) {
    const related = await getRelatedAccess(scope, groups);

    if (related.denied !== undefined) {
      if (parsed.disableErrors) return empty(denied);

      throw new QueryError([{ path: related.denied }]);
    }

    clauses.push(...related.clauses);
  }

  const where: Where = clauses.length ? { and: clauses } : {};
  const toPath = versions ? toVersionPath : (path: string) => path;

  const result = await adapter.aggregate({
    collection: collection.slug,
    db: payload.db,
    groupBy: groups.map(({ by, path, type }) => ({
      path: toPath(path),
      type,
      ...(by ? { by } : {}),
    })),
    values: (readable.length ? readable : [{ operation: 'count' as const }]).map((value) =>
      value.operation === 'count' ? value : { ...value, path: toPath(value.path) },
    ),
    sort: getSort(parsed, groups, columns),
    limit: parsed.limit,
    page: parsed.page,
    locale: req.locale,
    req,
    where: versions
      ? { and: [{ latest: { equals: true } }, appendVersionToQueryKey(where)] }
      : where,
    ...(versions ? { versions } : {}),
  });

  const rows: AggregateResult['groups'] = result.rows.map((row) => ({
    group: Object.fromEntries(
      groups.map(({ path, type }, index) => [path, toGroupKey(row.group[index], type, label)]),
    ),
    values: Object.fromEntries(
      parsed.values.map(({ name }, index) => {
        const value = values[index];

        return [name, value ? toAggregateValue(row.values[columns[index]], value, label) : null];
      }),
    ),
  }));

  if (!groups.length && !rows.length) return empty(denied);

  if (parsed.depth > 0) {
    await populateGroups({ depth: parsed.depth, groups, options: input, rows, scope });
  }

  const page = getAggregatePage({
    groups: rows,
    limit: parsed.limit,
    page: parsed.page,
    totalDocs: result.totalDocs,
  });

  return page as AggregateResult<T, V>;
}
