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

/**
 * A credential body's schema issues as one sentence and the failing field paths. Built from each
 * issue's path, code and expected shape only, so a received value never reaches the text.
 */
export function describeCredentialIssues({
  issues,
  input,
}: {
  issues: readonly Issue[];
  input: unknown;
}): { message: string; fields: string[] } {
  const fields: string[] = [];
  const parts = issues.flatMap((issue) => {
    if (issue.code === 'unrecognized_keys') {
      const keys = issue.keys.map((key) => formatIssuePath([...issue.path, key]));
      fields.push(...keys);

      return keys.map((key) => `${key} is not a known field`);
    }

    const path = formatIssuePath(issue.path);
    if (path) fields.push(path);

    return [`${path || 'the body'} ${reason(issue, input)}`];
  });

  return { message: `Invalid credentials: ${parts.join('; ')}.`, fields: [...new Set(fields)] };
}
