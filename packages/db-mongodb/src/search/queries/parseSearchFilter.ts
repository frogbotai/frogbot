import { SearchFilterUnsupportedError } from 'frogbot/search';

import type { SearchFieldType, SearchFilter, SearchFilterNode, SearchRange } from '../types.js';

const rangeOperators = {
  $gt: 'gt',
  $gte: 'gte',
  $lt: 'lt',
  $lte: 'lte',
} as const satisfies Record<string, keyof SearchRange>;

type ConditionArgs = {
  condition: unknown;
  index: string;
  path: string;
  type: SearchFieldType;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isObjectID(value: unknown): boolean {
  return isRecord(value) && value._bsontype === 'ObjectId';
}

function isScalar(value: unknown): boolean {
  return !isRecord(value) || value instanceof Date || isObjectID(value);
}

function isOperatorObject(value: unknown): value is Record<string, unknown> {
  if (isScalar(value) || !isRecord(value)) return false;

  const keys = Object.keys(value);

  return keys.length > 0 && keys.every((key) => key.startsWith('$'));
}

function isCompatible(type: SearchFieldType, value: unknown): boolean {
  switch (type) {
    case 'boolean':
      return typeof value === 'boolean';
    case 'date':
      return value instanceof Date && !Number.isNaN(value.getTime());
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'objectId':
      return isObjectID(value);
    case 'token':
      return typeof value === 'string';
  }
}

function unsupported(index: string, detail: string): SearchFilterUnsupportedError {
  return new SearchFilterUnsupportedError(`Search index '${index}' ${detail}`);
}

function dedupe(nodes: SearchFilterNode[]): SearchFilterNode[] {
  return [...new Map(nodes.map((node) => [JSON.stringify(node), node])).values()];
}

function and(filters: SearchFilter[]): SearchFilter {
  const nodes: SearchFilterNode[] = [];

  for (const filter of filters) {
    if (filter === false) return false;

    if (filter === true) continue;

    nodes.push(...(filter.type === 'and' ? filter.filters : [filter]));
  }

  const unique = dedupe(nodes);

  if (!unique.length) return true;

  return unique.length === 1 ? unique[0] : { type: 'and', filters: unique };
}

function or(filters: SearchFilter[]): SearchFilter {
  const nodes: SearchFilterNode[] = [];

  for (const filter of filters) {
    if (filter === true) return true;

    if (filter === false) continue;

    nodes.push(...(filter.type === 'or' ? filter.filters : [filter]));
  }

  const unique = dedupe(nodes);

  if (!unique.length) return false;

  return unique.length === 1 ? unique[0] : { type: 'or', filters: unique };
}

function not(filter: SearchFilter): SearchFilter {
  if (typeof filter === 'boolean') return !filter;

  return filter.type === 'not' ? filter.filter : { type: 'not', filter };
}

function equals({
  path,
  type,
  value,
}: Omit<ConditionArgs, 'condition' | 'index'> & { value: unknown }): SearchFilter {
  if (value === null) {
    return or([not({ type: 'exists', path }), { type: 'equals', path, value: null }]);
  }

  return isCompatible(type, value) ? { type: 'equals', path, value } : false;
}

function inValues({ condition, index, path, type }: ConditionArgs): SearchFilter {
  if (!Array.isArray(condition)) {
    throw unsupported(index, `cannot filter '${path}' with a non-array list.`);
  }

  const values = condition.filter((value) => value !== null && isCompatible(type, value));

  return or([
    values.length ? { type: 'in', path, values } : false,
    condition.includes(null) ? equals({ path, type, value: null }) : false,
  ]);
}

function parseCondition(args: ConditionArgs): SearchFilter {
  const { condition, index, path, type } = args;

  if (!isOperatorObject(condition)) {
    if (!isScalar(condition) || Array.isArray(condition)) {
      throw unsupported(index, `cannot filter '${path}' by a compound value.`);
    }

    return equals({ path, type, value: condition });
  }

  const filters: SearchFilter[] = [];
  const range: SearchRange = {};
  let rangeMatches = true;

  for (const [operator, value] of Object.entries(condition)) {
    switch (operator) {
      case '$eq':
        filters.push(equals({ path, type, value }));
        break;
      case '$ne':
        filters.push(not(equals({ path, type, value })));
        break;
      case '$in':
        filters.push(inValues({ ...args, condition: value }));
        break;
      case '$nin':
        filters.push(not(inValues({ ...args, condition: value })));
        break;
      case '$exists':
        if (typeof value !== 'boolean') {
          throw unsupported(index, `cannot filter '${path}' with a non-boolean '$exists'.`);
        }

        filters.push(value ? { type: 'exists', path } : not({ type: 'exists', path }));
        break;
      case '$not':
        filters.push(not(parseCondition({ ...args, condition: value })));
        break;
      case '$gt':
      case '$gte':
      case '$lt':
      case '$lte':
        if (type === 'boolean' || type === 'objectId' || value === null) {
          throw unsupported(index, `cannot filter '${path}' with '${operator}'.`);
        }

        range[rangeOperators[operator]] = value;
        rangeMatches &&= isCompatible(type, value);
        break;
      default:
        throw unsupported(index, `cannot filter '${path}' with '${operator}'.`);
    }
  }

  if (Object.keys(range).length) {
    filters.push(rangeMatches ? { type: 'range', path, range } : false);
  }

  return and(filters);
}

export function parseSearchFilter({
  fields,
  index,
  query,
}: {
  fields: Map<string, SearchFieldType>;
  index: string;
  query: Record<string, unknown>;
}): SearchFilter {
  const filters = Object.entries(query).map(([key, value]): SearchFilter => {
    if (key === '$and' || key === '$or' || key === '$nor') {
      if (!Array.isArray(value)) throw unsupported(index, `requires an array for '${key}'.`);

      const nested = value.map((item) => {
        if (!isRecord(item)) throw unsupported(index, `requires objects in '${key}'.`);

        return parseSearchFilter({ fields, index, query: item });
      });

      if (key === '$and') return and(nested);

      return key === '$or' ? or(nested) : not(or(nested));
    }

    const type = fields.get(key);

    if (key.startsWith('$') || !type) throw unsupported(index, `cannot filter path '${key}'.`);

    return parseCondition({ condition: value, index, path: key, type });
  });

  return and(filters);
}
