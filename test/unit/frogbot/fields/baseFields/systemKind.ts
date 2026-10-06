import { expect, it } from 'vitest';

import type { TextField } from '../../../../../packages/frogbot/src/fields/config/types.js';

type Schema = Parameters<NonNullable<TextField['typescriptSchema']>[number]>[0]['jsonSchema'];

type KindField = {
  access?: Record<string, unknown>;
  admin?: { components?: { Cell?: unknown }; custom?: unknown; [key: string]: unknown };
  hooks?: Record<string, ((args: never) => unknown)[] | undefined>;
  typescriptSchema?: TextField['typescriptSchema'];
};

export type HookArgs = {
  context?: Record<string, unknown>;
  operation?: 'create' | 'update';
  previousValue?: unknown;
  user?: { collection: string; id: number | string } | null;
  value?: unknown;
};

export function runSchema(field: KindField, jsonSchema: Schema) {
  return (field.typescriptSchema ?? []).reduce(
    (schema, entry) => entry({ jsonSchema: schema }),
    jsonSchema,
  );
}

export function runHook(
  field: KindField & { relationTo?: unknown },
  hook: 'beforeChange' | 'beforeDuplicate',
  { context = {}, operation = 'create', previousValue, user = null, value }: HookArgs,
) {
  const [kindHook] = field.hooks?.[hook] ?? [];

  return (kindHook as (args: unknown) => unknown)({
    context,
    field: { ...field, relationTo: field.relationTo ?? 'users' },
    operation,
    previousValue,
    req: { user },
    value,
  });
}

export function itBehavesLikeASystemKind({
  description,
  make,
  type,
}: {
  description: string;
  make: (args: Record<string, unknown>) => KindField;
  type: string;
}) {
  it('marks the field with its kind and no cell', () => {
    const field = make({});

    expect(field.admin?.custom).toEqual({ frogbot: { kind: { type } } });
    expect(field.admin?.components?.Cell).toBeUndefined();
  });

  it('is read-only in the admin and keeps other admin options', () => {
    const field = make({ admin: { position: 'sidebar', readOnly: false } });

    expect(field.admin).toMatchObject({ position: 'sidebar', readOnly: true });
  });

  it('denies create and update access', () => {
    const access = make({}).access as Record<string, () => boolean>;

    expect(Object.keys(access).sort()).toEqual(['create', 'update']);
    expect(access.create()).toBe(false);
    expect(access.update()).toBe(false);
  });

  it("keeps the developer's read access", () => {
    const read = () => true;
    const access = make({ access: { read } }).access as Record<string, unknown>;

    expect(access.read).toBe(read);
  });

  it("runs the kind hooks before the developer's", () => {
    const beforeChange = () => 1;
    const beforeDuplicate = () => 2;
    const afterRead = () => 3;
    const field = make({
      hooks: {
        afterRead: [afterRead],
        beforeChange: [beforeChange],
        beforeDuplicate: [beforeDuplicate],
      },
    });

    expect(field.hooks?.beforeChange).toHaveLength(2);
    expect(field.hooks?.beforeChange?.[1]).toBe(beforeChange);
    expect(field.hooks?.beforeDuplicate).toHaveLength(2);
    expect(field.hooks?.beforeDuplicate?.[1]).toBe(beforeDuplicate);
    expect(field.hooks?.afterRead).toEqual([afterRead]);
  });

  it('clears the value on duplicate', () => {
    const field = make({});

    expect(runHook(field, 'beforeDuplicate', { value: 7 })).toBeUndefined();
  });

  it('gives agents the kind text', () => {
    expect(runSchema(make({}), { type: ['number', 'null'] }).description).toBe(description);
  });

  it('appends the kind text to a developer description', () => {
    const field = make({ admin: { description: 'Owner' } });

    expect(runSchema(field, { type: ['number', 'null'], description: 'Owner' }).description).toBe(
      `Owner (${description[0].toLowerCase()}${description.slice(1)})`,
    );
  });
}
