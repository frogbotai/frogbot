import type { z } from 'zod';

type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue };

export type SubscriptionInput = { value?: JSONValue };

function normalize(input: unknown, ancestors = new Set<object>()): JSONValue {
  if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
  if (typeof input === 'number' && Number.isFinite(input)) return input === 0 ? 0 : input;
  if (
    typeof input !== 'object' ||
    ancestors.has(input) ||
    (!Array.isArray(input) &&
      Object.getPrototypeOf(input) !== Object.prototype &&
      Object.getPrototypeOf(input) !== null)
  ) {
    throw new Error(
      '[frogbot] Raw trigger input must be JSON data without cycles or non-JSON values.',
    );
  }
  ancestors.add(input);
  try {
    if (Array.isArray(input)) return Array.from(input, (value) => normalize(value, ancestors));
    if (Object.getOwnPropertySymbols(input).length) {
      throw new Error('[frogbot] Raw trigger input cannot contain symbol keys.');
    }
    return Object.fromEntries(
      Object.keys(input)
        .sort()
        .map((key) => [key, normalize((input as Record<string, unknown>)[key], ancestors)]),
    );
  } finally {
    ancestors.delete(input);
  }
}

export function encodeSubscriptionInput(input: unknown): SubscriptionInput {
  return input === undefined ? {} : { value: normalize(input) };
}

export function parseSubscriptionInput({
  schema,
  input,
}: {
  schema: z.ZodType;
  input: SubscriptionInput;
}): unknown {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => key !== 'value')
  ) {
    throw new Error('[frogbot] Subscription input must be a raw-input envelope.');
  }
  if (Object.hasOwn(input, 'value')) return schema.parse(normalize(input.value));
  const result = schema.safeParse(undefined);
  return result.success ? result.data : schema.parse({});
}
