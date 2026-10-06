import { describe, expect, it } from 'vitest';

import { sanitize } from '../../../../packages/frogbot/src/config/sanitize.js';
import type { FrogBotConfig } from '../../../../packages/frogbot/src/config/types.js';
import { sanitizeVectorFields } from '../../../../packages/frogbot/src/fields/config/sanitizeVector.js';
import type { Block, Field } from '../../../../packages/frogbot/src/fields/config/types.js';

const FIELD_CELL = '@frogbotai/next/client#FieldCell';

function projectBudget(overrides: Record<string, unknown> = {}): Field {
  return {
    name: 'projectBudget',
    type: 'number',
    virtual: 'project.budget',
    ...overrides,
  };
}

function config({ blocks, fields }: { blocks?: Block[]; fields: Field[] }): FrogBotConfig {
  return {
    secret: 'test-secret',
    db: { defaultIDType: 'number' } as FrogBotConfig['db'],
    collections: [
      { slug: 'projects', fields: [{ name: 'budget', type: 'number' }] },
      {
        slug: 'tasks',
        fields: [{ name: 'project', type: 'relationship', relationTo: 'projects' }, ...fields],
      },
    ],
    ...(blocks ? { blocks } : {}),
  };
}

function sanitizeOne(field: Field): Field & { admin?: Record<string, any> } {
  return sanitizeVectorFields({
    collection: 'tasks',
    fields: [field],
    users: { authSlugs: [], resolve: () => 'users' },
  })[0];
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

  if (record.name === name && typeof record.type === 'string') return record;

  return findField(Object.values(record), name);
}

async function runtimeTasks(fields: Field[], blocks?: Block[]) {
  const runtime = await sanitize(config({ blocks, fields }))._internal.payloadConfig;

  return { runtime, tasks: runtime.collections.find(({ slug }) => slug === 'tasks')?.fields };
}

describe('virtual path fields', () => {
  it('sets the FieldCell List Cell on a top-level path field in the runtime collection', async () => {
    const { tasks } = await runtimeTasks([projectBudget()]);

    expect(findField(tasks, 'projectBudget')?.admin?.components?.Cell).toBe(FIELD_CELL);
  });

  it.each<[string, (field: Field) => Field]>([
    ['named group', (field) => ({ name: 'details', type: 'group', fields: [field] })],
    ['row', (field) => ({ type: 'row', fields: [field] })],
    ['named tab', (field) => ({ type: 'tabs', tabs: [{ name: 'meta', fields: [field] }] })],
    ['array', (field) => ({ name: 'items', type: 'array', fields: [field] })],
    [
      'collection block',
      (field) => ({ name: 'content', type: 'blocks', blocks: [{ slug: 'note', fields: [field] }] }),
    ],
  ])('sets the FieldCell List Cell inside a %s', async (_, wrap) => {
    const { tasks } = await runtimeTasks([wrap(projectBudget())]);

    expect(findField(tasks, 'projectBudget')?.admin?.components?.Cell).toBe(FIELD_CELL);
  });

  it('sets the FieldCell List Cell in a config-level block', async () => {
    const { runtime } = await runtimeTasks(
      [{ name: 'content', type: 'blocks', blocks: [], blockReferences: ['hero'] }],
      [{ slug: 'hero', fields: [projectBudget()] }],
    );

    const hero = runtime.blocks?.find((block) => block.slug === 'hero');

    expect(findField(hero?.fields, 'projectBudget')?.admin?.components?.Cell).toBe(FIELD_CELL);
  });

  it("keeps the developer's own Cell and other admin.components keys", () => {
    const result = sanitizeOne(
      projectBudget({
        admin: {
          description: 'From the project',
          components: { Cell: './BudgetCell#Cell', Filter: './BudgetFilter#Filter' },
        },
      }),
    );

    expect(result.admin).toEqual({
      description: 'From the project',
      components: { Cell: './BudgetCell#Cell', Filter: './BudgetFilter#Filter' },
    });
  });

  it('adds the Cell next to other admin.components keys', () => {
    const result = sanitizeOne(
      projectBudget({ admin: { components: { Filter: './BudgetFilter#Filter' } } }),
    );

    expect(result.admin?.components).toEqual({
      Cell: FIELD_CELL,
      Filter: './BudgetFilter#Filter',
    });
  });

  it('gives a coloured virtual select both its colours and the Cell', () => {
    const result = sanitizeOne({
      name: 'projectStatus',
      type: 'select',
      virtual: 'project.status',
      options: [{ label: 'Active', value: 'active', color: 'green' }, 'paused'],
    });

    expect(result.admin).toEqual({
      components: { Cell: FIELD_CELL },
      custom: { frogbot: { optionColors: { active: 'green' } } },
    });
  });

  it.each<[string, Field]>([
    ['virtual: true', { name: 'total', type: 'number', virtual: true }],
    ['an ordinary field', { name: 'title', type: 'text' }],
  ])('returns %s as the same object', (_, field) => {
    expect(sanitizeOne(field)).toBe(field);
  });
});
