import type { ConnectionField } from './types.js';

export function projectConnectionSchema(value: unknown): ConnectionField {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Unsupported connection input schema.');
  }
  const schema = value as Record<string, unknown>;
  if (schema.$ref || schema.allOf || schema.oneOf || schema.not) {
    throw new Error('Unsupported connection input schema.');
  }
  if (Array.isArray(schema.anyOf)) {
    const branches = schema.anyOf as Record<string, unknown>[];
    const values = branches.filter((branch) => branch.type !== 'null');
    if (values.length !== 1) throw new Error('Unsupported connection input union.');
    return {
      ...projectConnectionSchema(values[0]),
      nullable: branches.some((branch) => branch.type === 'null'),
      ...(typeof schema.title === 'string' ? { title: schema.title } : {}),
      ...(typeof schema.description === 'string' ? { description: schema.description } : {}),
    };
  }
  if (
    !['string', 'number', 'integer', 'boolean', 'object', 'array'].includes(String(schema.type))
  ) {
    throw new Error('Unsupported connection input type.');
  }
  const field: ConnectionField = { type: schema.type as ConnectionField['type'] };
  const choices = Object.hasOwn(schema, 'const') ? [schema.const] : schema.enum;
  if (Array.isArray(choices) && !['object', 'array'].includes(field.type)) {
    field.choices = choices.filter((choice): choice is string | number | boolean =>
      ['string', 'number', 'boolean'].includes(typeof choice),
    );
  }
  for (const key of ['title', 'description'] as const) {
    if (typeof schema[key] === 'string') field[key] = schema[key];
  }
  for (const key of ['minLength', 'maxLength', 'minItems', 'maxItems'] as const) {
    if (typeof schema[key] === 'number') field[key] = schema[key];
  }
  if (field.type === 'object') {
    if (schema.additionalProperties !== undefined && schema.additionalProperties !== false) {
      throw new Error('Connection inputs require fixed object properties.');
    }
    field.properties = Object.fromEntries(
      Object.entries((schema.properties ?? {}) as Record<string, unknown>).map(([key, child]) => [
        key,
        projectConnectionSchema(child),
      ]),
    );
    field.required = Array.isArray(schema.required)
      ? schema.required.filter((key): key is string => typeof key === 'string')
      : [];
  }
  if (field.type === 'array') field.items = projectConnectionSchema(schema.items);
  return field;
}

export function initialConnectionValue(field: ConnectionField): unknown {
  if (field.choices?.length) return field.choices[0];
  if (field.type === 'object') {
    return Object.fromEntries(
      Object.entries(field.properties ?? {})
        .filter(([key]) => field.required?.includes(key))
        .map(([key, child]) => [key, initialConnectionValue(child)]),
    );
  }
  if (field.type === 'array') return [];
  if (field.type === 'boolean') return false;
  return '';
}

export function connectionInput({
  field,
  value,
  label = 'Credential',
}: {
  field: ConnectionField;
  value: unknown;
  label?: string;
}): unknown {
  if (value === undefined) return undefined;
  if (value === null) {
    if (!field.nullable) throw new Error(`${label} cannot be null.`);
    return null;
  }
  if (field.type === 'object') {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(field.properties ?? {})
        .filter(([key]) => Object.hasOwn(object, key) && object[key] !== undefined)
        .map(([key, child]) => [
          key,
          connectionInput({ field: child, value: object[key], label: child.title ?? key }),
        ]),
    );
  }
  if (field.type === 'array') {
    const items = value as unknown[];
    if (field.minItems !== undefined && items.length < field.minItems) {
      throw new Error(`${label} requires at least ${field.minItems} items.`);
    }
    return items.map((item, index) =>
      connectionInput({ field: field.items!, value: item, label: `${label} ${index + 1}` }),
    );
  }
  if (field.type === 'number' || field.type === 'integer') {
    const text = String(value).trim();
    const number = Number(text);
    if (
      !text ||
      !Number.isFinite(number) ||
      (field.type === 'integer' && !Number.isInteger(number))
    ) {
      throw new Error(`${label} must be a valid ${field.type}.`);
    }
    return number;
  }
  return value;
}
