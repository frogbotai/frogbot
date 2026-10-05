export type RejectFieldOptionsArgs = {
  factory: string;
  field: { name: string };
  keys: string[];
};

function readOption(field: object, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (value, part) =>
        value !== null && typeof value === 'object'
          ? (value as Record<string, unknown>)[part]
          : undefined,
      field,
    );
}

export function describeOptionValue(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

export function rejectFieldOptions({ factory, field, keys }: RejectFieldOptionsArgs): void {
  const key = keys.find((name) => readOption(field, name) !== undefined);

  if (key) throw new Error(`${factory} "${field.name}": ${key} is not supported`);
}
