type ValidatedField = {
  validate?: (value: never, options: never) => Promise<string | true> | string | true;
};

export function validateOptions(field: object) {
  return { ...field, req: { payload: { config: {} }, t: (key: string) => key } };
}

export async function validateField(field: ValidatedField, value: unknown) {
  return field.validate?.(value as never, validateOptions(field) as never);
}
