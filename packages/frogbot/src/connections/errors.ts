import type { z } from 'zod';

import { formatIssuePath } from '../chat/validateMessages.js';

/** A connection endpoint's failure: `{ errors: [{ message, data: { code, ...data } }] }`. */
export function errorResponse({
  status,
  message,
  code,
  data,
  headers,
}: {
  status: number;
  message: string;
  code: string;
  data?: Record<string, unknown>;
  headers?: Headers;
}): Response {
  return Response.json({ errors: [{ message, data: { code, ...data } }] }, { status, headers });
}

type Issue = z.ZodError['issues'][number];

function present(input: unknown, path: readonly PropertyKey[]): boolean {
  let value = input;

  for (const key of path) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) return false;
    value = (value as Record<PropertyKey, unknown>)[key];
  }

  return value !== undefined;
}

function reason(issue: Issue, input: unknown): string {
  switch (issue.code) {
    case 'invalid_type':
      if (!issue.path.length) return 'must be an object';

      return present(input, issue.path)
        ? `has the wrong type (expected ${issue.expected})`
        : `is required (expected ${issue.expected})`;
    case 'too_small':
      return `is too ${issue.origin === 'string' || issue.origin === 'array' ? 'short' : 'small'} (minimum ${String(issue.minimum)})`;
    case 'too_big':
      return `is too ${issue.origin === 'string' || issue.origin === 'array' ? 'long' : 'big'} (maximum ${String(issue.maximum)})`;
    case 'invalid_format':
      return `has the wrong format (expected ${issue.format})`;
    case 'invalid_value':
      return `must be one of ${issue.values.map(String).join(', ')}`;
    default:
      return 'is invalid';
  }
}

type Def = Record<string, unknown>;

function defOf(node: unknown): Def | undefined {
  const def = (node as { def?: unknown } | undefined)?.def;

  return def && typeof def === 'object' ? (def as Def) : undefined;
}

function unwrap(node: unknown): Def | undefined {
  let def = defOf(node);

  while (def && (def.innerType || def.in)) def = defOf(def.innerType ?? def.in);

  return def;
}

function declared(schema: unknown, path: readonly PropertyKey[]) {
  const kept: PropertyKey[] = [];
  let node = schema;

  for (const key of path) {
    const def = unwrap(node);
    const shape = def?.type === 'object' ? (def.shape as Def | undefined) : undefined;
    if (typeof key === 'string' && shape && Object.hasOwn(shape, key)) node = shape[key];
    else if (typeof key === 'number' && def?.type === 'array') node = def.element;
    else return { path: kept, complete: false };
    kept.push(key);
  }

  return { path: kept, complete: true };
}

/**
 * A credential body's schema issues as one sentence and the failing field paths. Built from each
 * issue's code, its expected shape and the paths the schema declares, so neither a received value
 * nor a key sent only in the body reaches the text.
 */
export function describeCredentialIssues({
  issues,
  input,
  schema,
}: {
  issues: readonly Issue[];
  input: unknown;
  schema: unknown;
}): { message: string; fields: string[] } {
  const fields: string[] = [];
  const parts = issues.map((issue) => {
    const { path, complete } = declared(schema, issue.path);
    const name = formatIssuePath(path);
    if (name) fields.push(name);
    const subject = name || 'the body';

    if (issue.code === 'unrecognized_keys') return `${subject} has fields the key doesn't take`;
    if (!complete) return `${subject} has an invalid entry`;

    return `${subject} ${reason(issue, input)}`;
  });

  return { message: `Invalid credentials: ${parts.join('; ')}.`, fields: [...new Set(fields)] };
}
