import { describe, expect, it } from 'vitest';

import { sanitize } from '../../../../packages/frogbot/src/config/sanitize.js';
import type { FrogBotConfig } from '../../../../packages/frogbot/src/config/types.js';
import { sanitizeVectorFields } from '../../../../packages/frogbot/src/fields/config/sanitizeVector.js';
import type {
  Block,
  Field,
  RadioField,
  SelectField,
} from '../../../../packages/frogbot/src/fields/config/types.js';

const FIELD_CELL = '@frogbotai/next/client#FieldCell';

function status(overrides: Partial<SelectField> = {}): SelectField {
  return {
    name: 'status',
    type: 'select',
    options: [
      { label: 'Todo', value: 'todo' },
      { label: 'Done', value: 'done', color: 'green' },
    ],
    ...overrides,
  } as SelectField;
}

function priority(): RadioField {
  return {
    name: 'priority',
    type: 'radio',
    options: [
      { label: 'Low', value: 'low', color: 'gray' },
      { label: 'High', value: 'high', color: 'red' },
    ],
  };
}

function config({ blocks, fields }: { blocks?: Block[]; fields: Field[] }): FrogBotConfig {
  return {
    secret: 'test-secret',
    db: { defaultIDType: 'number' } as FrogBotConfig['db'],
    collections: [{ slug: 'tasks', fields }],
    ...(blocks ? { blocks } : {}),
  };
}

function sanitizeOne(field: Field): Field & { admin?: Record<string, any> } {
  return sanitizeVectorFields({ collection: 'tasks', fields: [field] })[0] as Field & {
    admin?: Record<string, any>;
  };
}

function findField(fields: unknown, name: string): Record<string, any> | undefined {
  if (!fields || typeof fields !== 'object') return undefined;

  if (Array.isArray(fields)) {
    for (const item of fields) {
      const found = findField(item, name);

      if (found) return found;
    }

    return undefined;
  }

  const record = fields as Record<string, any>;

  if (record.name === name && (record.type === 'select' || record.type === 'radio')) return record;

  return findField(Object.values(record), name);
}

const coloredAdmin = {
  components: { Cell: FIELD_CELL },
  custom: { frogbot: { optionColors: { done: 'green' } } },
};

describe('option colors', () => {
  it('copies select and radio colours and sets the List Cell in the runtime collection', async () => {
    const runtime = await sanitize(config({ fields: [status(), priority()] }))._internal
      .payloadConfig;

    const fields = runtime.collections.find(({ slug }) => slug === 'tasks')?.fields;

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'status', admin: expect.objectContaining(coloredAdmin) }),
        expect.objectContaining({
          name: 'priority',
          admin: expect.objectContaining({
            components: { Cell: FIELD_CELL },
            custom: { frogbot: { optionColors: { low: 'gray', high: 'red' } } },
          }),
        }),
      ]),
    );
  });

  it.each<[string, (field: Field) => Field]>([
    ['group', (field) => ({ name: 'details', type: 'group', fields: [field] })],
    ['array', (field) => ({ name: 'items', type: 'array', fields: [field] })],
    ['row', (field) => ({ type: 'row', fields: [field] })],
    ['collapsible', (field) => ({ type: 'collapsible', label: 'More', fields: [field] })],
    ['named tab', (field) => ({ type: 'tabs', tabs: [{ name: 'details', fields: [field] }] })],
    ['unnamed tab', (field) => ({ type: 'tabs', tabs: [{ label: 'Details', fields: [field] }] })],
    [
      'collection block',
      (field) => ({ name: 'content', type: 'blocks', blocks: [{ slug: 'note', fields: [field] }] }),
    ],
    [
      'inline blockReferences block',
      (field) => ({
        name: 'content',
        type: 'blocks',
        blocks: [],
        blockReferences: [{ slug: 'note', fields: [field] }],
      }),
    ],
  ])('copies colours and sets the List Cell inside a %s', (_, wrap) => {
    const [result] = sanitizeVectorFields({ collection: 'tasks', fields: [wrap(status())] });

    expect(findField(result, 'status')?.admin).toEqual(coloredAdmin);
  });

  it('copies colours and sets the List Cell in a config-level block', async () => {
    const runtime = await sanitize(
      config({
        blocks: [{ slug: 'hero', fields: [status()] }],
        fields: [{ name: 'content', type: 'blocks', blocks: [], blockReferences: ['hero'] }],
      }),
    )._internal.payloadConfig;

    const hero = runtime.blocks?.find((block) => block.slug === 'hero');

    expect(findField(hero?.fields, 'status')?.admin).toEqual(coloredAdmin);
  });

  it('copies colours for a hasMany select', () => {
    const result = sanitizeOne(status({ hasMany: true }));

    expect(result).toMatchObject({ hasMany: true, admin: coloredAdmin });
  });

  it('copies only the coloured options when string options are mixed in', () => {
    const result = sanitizeOne(
      status({ options: ['backlog', { label: 'Done', value: 'done', color: 'green' }, 'todo'] }),
    );

    expect(result.admin?.custom).toEqual({ frogbot: { optionColors: { done: 'green' } } });
  });

  it('keeps a separate colour map for each field that shares an option value', () => {
    const [first, second] = sanitizeVectorFields({
      collection: 'tasks',
      fields: [
        status(),
        {
          name: 'review',
          type: 'select',
          options: [{ label: 'Done', value: 'done', color: 'purple' }],
        },
      ],
    }) as (Field & { admin?: Record<string, any> })[];

    expect(first.admin?.custom.frogbot.optionColors).toEqual({ done: 'green' });
    expect(second.admin?.custom.frogbot.optionColors).toEqual({ done: 'purple' });
  });

  it('returns an uncoloured field as the same object without a Cell', () => {
    const field = status({
      options: ['todo', { label: 'Done', value: 'done', color: undefined }],
    });

    const result = sanitizeOne(field);

    expect(result).toBe(field);
    expect(result.admin).toBeUndefined();
  });

  it("keeps the developer's own Cell", () => {
    const result = sanitizeOne(status({ admin: { components: { Cell: './StatusCell#Cell' } } }));

    expect(result.admin).toEqual({
      components: { Cell: './StatusCell#Cell' },
      custom: { frogbot: { optionColors: { done: 'green' } } },
    });
  });

  it('keeps a kind marker and other admin.custom keys', () => {
    const result = sanitizeOne(
      status({
        admin: {
          description: 'Workflow state',
          custom: { team: 'ops', frogbot: { kind: { type: 'channel' }, other: true } },
        },
      }),
    );

    expect(result.admin).toEqual({
      description: 'Workflow state',
      components: { Cell: FIELD_CELL },
      custom: {
        team: 'ops',
        frogbot: { kind: { type: 'channel' }, other: true, optionColors: { done: 'green' } },
      },
    });
  });

  it('leaves the options exactly as written', () => {
    const field = status();
    const result = sanitizeOne(field);

    expect((result as SelectField).options).toBe(field.options);
    expect((result as SelectField).options[1]).toEqual({
      label: 'Done',
      value: 'done',
      color: 'green',
    });
  });

  it('names the collection, field and option for an unknown colour', () => {
    const field = status({ options: [{ label: 'Done', value: 'done', color: 'grene' as never }] });

    expect(() => sanitize(config({ fields: [field] }))).toThrow(
      "[frogbot] Select field 'status' in collection 'tasks': option 'done' has unknown color 'grene'. Use one of: gray, blue, cyan, teal, green, yellow, orange, red, pink, purple.",
    );
  });

  it('names the nested path for an unknown radio colour', () => {
    const field = {
      ...priority(),
      options: [{ label: 'High', value: 'high', color: 'Green' as never }],
    };

    expect(() =>
      sanitize(config({ fields: [{ name: 'details', type: 'group', fields: [field] }] })),
    ).toThrow(
      "[frogbot] Radio field 'details.priority' in collection 'tasks': option 'high' has unknown color 'Green'.",
    );
  });

  it('names the config-level block for an unknown colour', () => {
    const field = status({ options: [{ label: 'Done', value: 'done', color: null as never }] });

    expect(() =>
      sanitize(config({ blocks: [{ slug: 'hero', fields: [field] }], fields: [] })),
    ).toThrow(
      "[frogbot] Select field 'status' in block 'hero': option 'done' has unknown color 'null'.",
    );
  });
});
