import type { UIMessage } from 'ai';
import { validateUIMessages } from 'ai';
import { z } from 'zod';

const fileReferenceSchema = z
  .object({
    type: z.literal('file-reference'),
    id: z.union([z.string(), z.number()]),
    filename: z.string(),
    mediaType: z.string(),
    origin: z.literal('paste').optional(),
  })
  .strict();

export async function validateChatMessages(
  messages: unknown[],
  tools?: Parameters<typeof validateUIMessages<UIMessage>>[0]['tools'],
): Promise<UIMessage[]> {
  const references = messages.map((message, index) => {
    if (
      !message ||
      typeof message !== 'object' ||
      !('parts' in message) ||
      !Array.isArray(message.parts)
    ) {
      return [];
    }

    return message.parts.map((part, partIndex) => {
      if (
        !part ||
        typeof part !== 'object' ||
        !('type' in part) ||
        part.type !== 'file-reference'
      ) {
        return undefined;
      }

      const parsed = fileReferenceSchema.safeParse(part);

      if (parsed.success) return parsed.data;

      throw new z.ZodError(
        parsed.error.issues.map((issue) => ({
          ...issue,
          path: [index, 'parts', partIndex, ...issue.path],
        })),
      );
    });
  });

  const filtered = messages.map((message, index) => {
    if (
      !message ||
      typeof message !== 'object' ||
      !('parts' in message) ||
      !Array.isArray(message.parts)
    ) {
      return message;
    }

    return {
      ...message,
      parts: message.parts.map((part, partIndex) =>
        references[index]?.[partIndex] ? { type: 'text', text: '' } : part,
      ),
    };
  });

  const validated = await validateUIMessages({ messages: filtered, tools });

  return validated.map(
    (message, index) =>
      ({
        ...message,
        parts: message.parts.map((part, partIndex) => references[index]?.[partIndex] ?? part),
      }) as UIMessage,
  );
}

type Issue = {
  code?: string;
  path: PropertyKey[];
  message: string;
  values?: unknown[];
  prefix?: string;
  errors?: Issue[][];
};

/**
 * Names the first field `validateChatMessages` rejected and why, as
 * `` `messages[0].parts[0].type`: expected one of 'text' | 'file' | …, received 'txt' ``.
 */
export function describeMessagesError(error: unknown, messages: unknown[]): string | undefined {
  if (!error || typeof error !== 'object') return undefined;

  const { cause, context, value } = error as {
    cause?: unknown;
    context?: { field?: unknown };
    value?: unknown;
  };

  if (typeof context?.field === 'string') {
    const issue = issuesOf(cause)?.[0];

    if (issue) return describeIssue(issue, value, context.field);

    return `\`${context.field}\`: ${cause instanceof Error ? cause.message : String(cause)}`;
  }

  const issue = issuesOf(error)?.[0] ?? issuesOf(cause)?.[0];

  return issue ? describeIssue(issue, messages, 'messages') : undefined;
}

/** Formats a Zod issue path as `messages[0].parts[0].type`, after `base` when given. */
export function formatIssuePath(path: readonly PropertyKey[], base = ''): string {
  return path.reduce<string>(
    (formatted, key) =>
      typeof key === 'number'
        ? `${formatted}[${key}]`
        : `${formatted}${formatted ? '.' : ''}${String(key)}`,
    base,
  );
}

function issuesOf(value: unknown): Issue[] | undefined {
  if (!value || typeof value !== 'object' || !('issues' in value)) return undefined;

  return Array.isArray(value.issues) ? (value.issues as Issue[]) : undefined;
}

function describeIssue(issue: Issue, input: unknown, base: string): string {
  const path = formatIssuePath(issue.path, base);
  const value = valueAt(input, issue.path);

  if (issue.code === 'invalid_union' && issue.errors?.length) {
    return describeUnion(issue.errors, value, path);
  }

  return `\`${path}\`: ${reason(issue, value)}`;
}

function describeUnion(branches: Issue[][], input: unknown, path: string): string {
  let alive = branches;

  for (;;) {
    const matched = alive.find((branch) => mismatches(branch).length === 0);

    if (matched?.[0]) return describeIssue(matched[0], input, path);

    const key = discriminator(alive);
    const remaining = alive.filter((branch) => !mismatches(branch).includes(key));

    if (remaining.length === 0) {
      const expected = new Set(
        alive.flatMap((branch) =>
          branch.filter((issue) => issue.path[0] === key).flatMap(expectedValues),
        ),
      );

      return `\`${formatIssuePath([key], path)}\`: expected one of ${[...expected].join(' | ')}, received ${show(valueAt(input, [key]))}`;
    }

    alive = remaining;
  }
}

function discriminator(branches: Issue[][]): PropertyKey {
  const counts = new Map<PropertyKey, number>();

  for (const key of branches.flatMap(mismatches)) counts.set(key, (counts.get(key) ?? 0) + 1);

  return [...counts].reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0];
}

function mismatches(branch: Issue[]): PropertyKey[] {
  return branch
    .filter((issue) => issue.path.length === 1 && expectedValues(issue).length > 0)
    .map((issue) => issue.path[0]);
}

function expectedValues(issue: Issue): string[] {
  if (issue.code === 'invalid_value') return (issue.values ?? []).map(show);

  if (issue.code === 'invalid_format' && issue.prefix) return [`'${issue.prefix}*'`];

  return [];
}

function reason(issue: Issue, value: unknown): string {
  const expected = expectedValues(issue);

  if (expected.length > 0) {
    return `expected ${expected.length > 1 ? `one of ${expected.join(' | ')}` : expected[0]}, received ${show(value)}`;
  }

  return issue.message.replace(/^Invalid (input|option|string): /, '');
}

function valueAt(input: unknown, path: readonly PropertyKey[]): unknown {
  return path.reduce<unknown>(
    (value, key) =>
      value && typeof value === 'object' ? (value as Record<PropertyKey, unknown>)[key] : undefined,
    input,
  );
}

function show(value: unknown): string {
  return typeof value === 'string'
    ? `'${value}'`
    : value === undefined
      ? 'undefined'
      : JSON.stringify(value);
}
