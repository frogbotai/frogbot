import type { PayloadRequest, SanitizedCollectionConfig, Where } from 'payload';
import { executeAccess, Forbidden } from 'payload';

import type { FrogBotRequest } from '../types/request.js';
import { SearchFilterUnsupportedError } from './errors.js';
import type { SearchIndexDescriptor } from './types.js';

const operators = new Set([
  'equals',
  'not_equals',
  'in',
  'not_in',
  'exists',
  'greater_than',
  'greater_than_equal',
  'less_than',
  'less_than_equal',
]);

function validValue(
  type: SearchIndexDescriptor['filterFields'][string]['type'],
  value: unknown,
): boolean {
  if (typeof value === 'number') {
    return Number.isFinite(value) && (type === 'number' || type === 'id');
  }

  if (typeof value === 'string') {
    return type === 'string' || type === 'date' || type === 'id';
  }

  return typeof value === 'boolean' && type === 'boolean';
}

function validateWhere(where: unknown, index: SearchIndexDescriptor): asserts where is Where {
  if (!where || typeof where !== 'object' || Array.isArray(where)) {
    throw new SearchFilterUnsupportedError(
      `Search index '${index.name}' requires an object where predicate.`,
    );
  }

  for (const [path, constraint] of Object.entries(where)) {
    if (path === 'and' || path === 'or') {
      if (!Array.isArray(constraint) || !constraint.length) {
        throw new SearchFilterUnsupportedError(
          `Search index '${index.name}' requires a non-empty ${path} predicate.`,
        );
      }

      for (const item of constraint) validateWhere(item, index);

      continue;
    }

    const field = Object.hasOwn(index.filterFields, path) ? index.filterFields[path] : undefined;

    if (!field || field.many) {
      throw new SearchFilterUnsupportedError(
        `Search index '${index.name}' cannot filter path '${path}'.`,
      );
    }

    if (
      !constraint ||
      typeof constraint !== 'object' ||
      Array.isArray(constraint) ||
      !Object.keys(constraint).length
    ) {
      throw new SearchFilterUnsupportedError(
        `Search index '${index.name}' requires operators on '${path}'.`,
      );
    }

    for (const [operator, value] of Object.entries(constraint)) {
      const isList = operator === 'in' || operator === 'not_in';

      if (
        !operators.has(operator) ||
        (operator === 'exists' && typeof value !== 'boolean') ||
        (isList &&
          (!Array.isArray(value) ||
            !value.length ||
            value.some((item) => !validValue(field.type, item)))) ||
        (!isList && operator !== 'exists' && !validValue(field.type, value)) ||
        (operator.includes('than') && (field.type === 'boolean' || field.type === 'id'))
      ) {
        throw new SearchFilterUnsupportedError(
          `Search index '${index.name}' cannot filter '${path}' with '${operator}'.`,
        );
      }
    }
  }
}

export async function resolveSearchPredicate({
  collection,
  index,
  where,
  req,
  overrideAccess,
  draft,
}: {
  collection: SanitizedCollectionConfig;
  index: SearchIndexDescriptor;
  where?: Where;
  req: FrogBotRequest;
  overrideAccess: boolean;
  draft: boolean;
}): Promise<Where> {
  const access = overrideAccess
    ? true
    : await executeAccess({ req: req as unknown as PayloadRequest }, collection.access.read);

  if (!access) throw new Forbidden(req.t);

  const clauses: Where[] = [];

  if (where) clauses.push(where);

  if (typeof access === 'object') clauses.push(access);

  if (collection.trash) clauses.push({ deletedAt: { exists: false } });

  if (collection.versions?.drafts && !draft) clauses.push({ _status: { equals: 'published' } });

  const predicate: Where = clauses.length ? { and: clauses } : {};

  validateWhere(predicate, index);

  return predicate;
}
