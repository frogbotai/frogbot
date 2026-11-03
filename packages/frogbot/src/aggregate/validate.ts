import type { Sort, Where } from 'payload';

import { AggregateValidationError, describeAggregate } from './errors.js';
import type { AggregateDateUnit, AggregateOperation, AggregateOptions } from './types.js';

export type ParsedAggregateGroup = {
  path: string;
  by?: AggregateDateUnit;
};

export type ParsedAggregateValue = {
  name: string;
  operation: AggregateOperation;
  path?: string;
};

export type ParsedAggregateSort = {
  name: string;
  direction: 'asc' | 'desc';
};

export type ParsedAggregate = {
  groupBy: ParsedAggregateGroup[];
  values: ParsedAggregateValue[];
  sort: ParsedAggregateSort[];
  where?: Where;
  limit?: number;
  page: number;
  depth: number;
  draft: boolean;
  trash: boolean;
  disableErrors: boolean;
  overrideAccess: boolean;
};

const optionKeys = new Set<string>([
  'collection',
  'context',
  'depth',
  'disableErrors',
  'draft',
  'fallbackLocale',
  'groupBy',
  'limit',
  'locale',
  'overrideAccess',
  'page',
  'populate',
  'req',
  'sort',
  'trash',
  'values',
  'where',
] satisfies (keyof AggregateOptions)[]);

const dateUnits = new Set<string>([
  'day',
  'week',
  'month',
  'quarter',
  'year',
] satisfies AggregateDateUnit[]);

const operations = new Set<string>([
  'count',
  'sum',
  'avg',
  'min',
  'max',
] satisfies AggregateOperation[]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPath(value: unknown): value is string {
  return typeof value === 'string' && /^[^.\s]+(\.[^.\s]+)*$/.test(value);
}

/** Refuses any option the Local API doesn't define, before hooks see the arguments. */
export function assertAggregateKeys(options: unknown): asserts options is AggregateOptions {
  if (!isRecord(options)) {
    throw new AggregateValidationError('Aggregate requires an options object.');
  }

  const label = describeAggregate(String(options.collection));
  const key = Object.keys(options).find((name) => !optionKeys.has(name));

  if (key !== undefined) throw new AggregateValidationError(`${label} does not accept '${key}'.`);
}

function parseGroup(entry: unknown, label: string): ParsedAggregateGroup {
  if (isPath(entry)) return { path: entry };

  if (!isRecord(entry) || Object.keys(entry).some((key) => key !== 'field' && key !== 'by')) {
    throw new AggregateValidationError(
      `${label} requires each groupBy entry to be a field path or { field, by }.`,
    );
  }

  if (!isPath(entry.field)) {
    throw new AggregateValidationError(`${label} requires a field path in groupBy.`);
  }

  if (typeof entry.by !== 'string' || !dateUnits.has(entry.by)) {
    throw new AggregateValidationError(
      `${label} cannot group '${entry.field}' by '${String(entry.by)}': use day, week, month, quarter or year.`,
    );
  }

  return { path: entry.field, by: entry.by as AggregateDateUnit };
}

function parseValue(name: string, value: unknown, label: string): ParsedAggregateValue {
  const entries = isRecord(value) ? Object.entries(value) : [];

  if (entries.length !== 1 || !operations.has(entries[0][0])) {
    throw new AggregateValidationError(
      `${label} requires value '${name}' to be one of { count: true }, { sum }, { avg }, { min } or { max }.`,
    );
  }

  const [[operation, path]] = entries;

  if (operation === 'count') {
    if (path !== true) {
      throw new AggregateValidationError(
        `${label} requires value '${name}' to be { count: true }.`,
      );
    }

    return { name, operation };
  }

  if (!isPath(path)) {
    throw new AggregateValidationError(`${label} requires a field path for value '${name}'.`);
  }

  return { name, operation: operation as AggregateOperation, path };
}

function parseSort(sort: Sort | undefined, label: string): ParsedAggregateSort[] {
  if (sort === undefined) return [];

  const items: unknown[] = Array.isArray(sort) ? sort : [sort];

  return items.map((item) => {
    if (typeof item !== 'string' || !item || item === '-') {
      throw new AggregateValidationError(`${label} requires sort to name a group or a value.`);
    }

    return item.startsWith('-')
      ? { name: item.slice(1), direction: 'desc' }
      : { name: item, direction: 'asc' };
  });
}

function parseInteger(
  value: unknown,
  { label, name, min }: { label: string; name: string; min: number },
): number | undefined {
  if (value === undefined) return undefined;

  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) {
    throw new AggregateValidationError(
      `${label} requires ${name} to be an integer of ${min} or more.`,
    );
  }

  return value;
}

function parseBoolean(value: unknown, { label, name }: { label: string; name: string }): boolean {
  if (value === undefined) return false;

  if (typeof value !== 'boolean') {
    throw new AggregateValidationError(`${label} requires ${name} to be a boolean.`);
  }

  return value;
}

/** Checks every option's shape; field types are checked against the collection afterwards. */
export function parseAggregateOptions(options: AggregateOptions): ParsedAggregate {
  const label = describeAggregate(options.collection);
  const groupInput: unknown = options.groupBy;
  const groupEntries = Array.isArray(groupInput) ? groupInput : [groupInput];

  if (!groupEntries.length) {
    throw new AggregateValidationError(`${label} requires at least one groupBy field.`);
  }

  const groupBy = groupEntries.map((entry) => parseGroup(entry, label));
  const groupPaths = new Set<string>();

  for (const { path } of groupBy) {
    if (groupPaths.has(path)) {
      throw new AggregateValidationError(`${label} groups by '${path}' more than once.`);
    }

    groupPaths.add(path);
  }

  const valuesInput: unknown = options.values;

  if (!isRecord(valuesInput) || !Object.keys(valuesInput).length) {
    throw new AggregateValidationError(`${label} requires at least one named value.`);
  }

  const values = Object.entries(valuesInput).map(([name, value]) => {
    if (!name || name.startsWith('-') || groupPaths.has(name)) {
      throw new AggregateValidationError(
        `${label} cannot name a value '${name}': names must differ from groupBy paths and not start with '-'.`,
      );
    }

    return parseValue(name, value, label);
  });

  const sort = parseSort(options.sort, label);
  const valueNames = new Set(values.map(({ name }) => name));

  for (const { name } of sort) {
    if (!groupPaths.has(name) && !valueNames.has(name)) {
      throw new AggregateValidationError(
        `${label} cannot sort by '${name}': sort names a groupBy path or a value name.`,
      );
    }
  }

  if (options.where !== undefined && !isRecord(options.where)) {
    throw new AggregateValidationError(`${label} requires where to be an object.`);
  }

  if (options.populate !== undefined && !isRecord(options.populate)) {
    throw new AggregateValidationError(`${label} requires populate to be an object.`);
  }

  if (options.locale === 'all' || options.locale === '*' || options.req?.locale === 'all') {
    throw new AggregateValidationError(`${label} requires a single locale.`);
  }

  const limit = parseInteger(options.limit, { label, name: 'limit', min: 0 });

  return {
    groupBy,
    values,
    sort,
    where: options.where,
    limit: limit || undefined,
    page: parseInteger(options.page, { label, name: 'page', min: 1 }) ?? 1,
    depth: parseInteger(options.depth, { label, name: 'depth', min: 0 }) ?? 0,
    draft: parseBoolean(options.draft, { label, name: 'draft' }),
    trash: parseBoolean(options.trash, { label, name: 'trash' }),
    disableErrors: parseBoolean(options.disableErrors, { label, name: 'disableErrors' }),
    overrideAccess: parseBoolean(options.overrideAccess, { label, name: 'overrideAccess' }),
  };
}
