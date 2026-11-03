import { describe, expect, it, vi } from 'vitest';

import { sanitizeCollection } from '../../../../../packages/frogbot/src/collections/config/sanitize.js';
import type { CollectionConfig } from '../../../../../packages/frogbot/src/collections/config/types.js';
import { ensureAutonumbers } from '../../../../../packages/frogbot/src/fields/baseFields/autonumber/counter.js';
import { autonumberField } from '../../../../../packages/frogbot/src/fields/baseFields/autonumber/index.js';
import type { FrogBot } from '../../../../../packages/frogbot/src/frogbot.js';
import { itBehavesLikeASystemKind, runHook, runSchema } from './systemKind.js';

describe('autonumberField', () => {
  itBehavesLikeASystemKind({
    type: 'autonumber',
    description: 'Unique number set by FrogBot when the record is created; read-only',
    make: (args) => autonumberField({ name: 'number', ...args }),
  });

  it('returns a unique single number field', () => {
    const field = autonumberField({ name: 'number', label: 'Ticket #' });

    expect(field).toMatchObject({
      type: 'number',
      name: 'number',
      label: 'Ticket #',
      unique: true,
    });
    expect(field.hasMany).toBeUndefined();
  });

  it('gives agents a whole number', () => {
    expect(runSchema(autonumberField({ name: 'number' }), { type: ['number', 'null'] })).toEqual({
      type: ['integer', 'null'],
      description: 'Unique number set by FrogBot when the record is created; read-only',
    });
  });

  it('keeps the previous number on update', async () => {
    const field = autonumberField({ name: 'number' });

    expect(
      await runHook(field, 'beforeChange', { operation: 'update', previousValue: 4, value: 9 }),
    ).toBe(4);
  });

  it('writes nothing on an update of a record without a number', async () => {
    const [assign] = autonumberField({ name: 'number' }).hooks!.beforeChange!;
    const siblingData = { title: 'Printer', number: null };

    const result = await (assign as (args: unknown) => unknown)({
      field: { name: 'number' },
      operation: 'update',
      previousValue: null,
      siblingData,
      value: null,
    });

    expect(result).toBeUndefined();
    expect(siblingData).toEqual({ title: 'Printer' });
  });

  it('keeps the stored number on an update whose latest version has none', async () => {
    const [assign] = autonumberField({ name: 'ref' }).hooks!.beforeChange!;
    const findOne = vi.fn(() => Promise.resolve({ id: 7, details: { ref: 3 } }));

    const result = await (assign as (args: unknown) => unknown)({
      collection: { slug: 'tickets' },
      field: { name: 'ref' },
      operation: 'update',
      originalDoc: { id: 7, details: {} },
      path: ['details', 'ref'],
      previousValue: undefined,
      req: { frogbot: { db: { findOne } } },
      siblingData: {},
      value: undefined,
    });

    expect(result).toBe(3);
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'tickets', where: { id: { equals: 7 } } }),
    );
  });
});

describe('autonumberField with a scope', () => {
  const description =
    'Number set by FrogBot when the record is created, unique within each project; read-only';

  function sanitizeIssues(fields: CollectionConfig['fields']) {
    const onAutonumber = vi.fn();
    const collection = sanitizeCollection({ slug: 'issues', fields }, vi.fn(), {
      onAutonumber,
      resolveFrogBot: vi.fn(),
    });

    return { collection, onAutonumber };
  }

  const project = {
    name: 'project',
    type: 'relationship',
    relationTo: 'projects',
    required: true,
  } as const;

  it('marks the kind with its scope and drops the unique column', () => {
    const field = autonumberField({ name: 'number', scope: 'project' });

    expect(field.unique).toBe(false);
    expect(field).not.toHaveProperty('scope');
    expect(field.admin?.custom).toEqual({
      frogbot: { kind: { type: 'autonumber', scope: 'project' } },
    });
  });

  it('tells agents the number is unique within each scope', () => {
    const field = autonumberField({ name: 'number', scope: 'project' });

    expect(runSchema(field, { type: ['number', 'null'] })).toEqual({
      type: ['integer', 'null'],
      description,
    });
  });

  it('adds a unique index on the scope and the number', () => {
    const { collection, onAutonumber } = sanitizeIssues([
      { name: 'title', type: 'text' },
      project,
      autonumberField({ name: 'number', scope: 'project' }),
    ]);

    expect(collection.indexes).toEqual([{ fields: ['project', 'number'], unique: true }]);
    expect(onAutonumber).toHaveBeenCalledWith('number', { name: 'project', path: 'project' });
  });

  it('finds the scope beside the number inside a group and a row', () => {
    const { collection, onAutonumber } = sanitizeIssues([
      {
        name: 'details',
        type: 'group',
        fields: [
          { type: 'row', fields: [project] },
          autonumberField({ name: 'ref', scope: 'project' }),
        ],
      },
    ]);

    expect(collection.indexes).toEqual([
      { fields: ['details.project', 'details.ref'], unique: true },
    ]);
    expect(onAutonumber).toHaveBeenCalledWith('details.ref', {
      name: 'project',
      path: 'details.project',
    });
  });

  it('leaves an unscoped field without an index', () => {
    const { collection, onAutonumber } = sanitizeIssues([autonumberField({ name: 'number' })]);

    expect(collection.indexes).toBeUndefined();
    expect(onAutonumber).toHaveBeenCalledWith('number', undefined);
  });

  it.each([
    ['missing', []],
    ['optional', [{ ...project, required: false }]],
    ['hasMany', [{ ...project, hasMany: true }]],
    ['localized', [{ ...project, localized: true }]],
    ['polymorphic', [{ ...project, relationTo: ['projects', 'teams'] }]],
    ['not a relationship', [{ name: 'project', type: 'text', required: true }]],
  ])('fails at startup when the scope is %s', (_label, fields) => {
    expect(() =>
      sanitizeIssues([
        ...(fields as CollectionConfig['fields']),
        autonumberField({ name: 'number', scope: 'project' }),
      ]),
    ).toThrow(
      new Error(
        "[frogbot] Autonumber field 'number' in collection 'issues' has scope 'project', which must be a required relationship to one collection, not localized or hasMany.",
      ),
    );
  });
});

describe('autonumberField option errors', () => {
  it.each([
    [{ hasMany: true }, 'hasMany is not supported'],
    [{ localized: true }, 'localized is not supported'],
    [{ defaultValue: 1 }, 'defaultValue is not supported'],
    [{ required: true }, 'required is not supported'],
    [{ unique: false }, 'unique is not supported'],
    [{ virtual: true }, 'virtual is not supported'],
    [{ access: { create: () => true } }, 'access.create is not supported'],
    [{ access: { update: () => true } }, 'access.update is not supported'],
  ])('rejects %o at call time', (options, message) => {
    expect(() => autonumberField({ name: 'number', ...(options as object) })).toThrow(
      new Error(`autonumberField "number": ${message}`),
    );
  });
});

describe('ensureAutonumbers', () => {
  it('logs a warning naming each failed field and resolves', async () => {
    const warn = vi.fn();
    const findOne = vi.fn().mockRejectedValue(new Error('database unavailable'));

    const frogbot = {
      config: {
        _internal: {
          autonumbers: [
            { collection: 'tickets', path: 'number' },
            { collection: 'orders', path: 'ref' },
          ],
          autonumberKeys: [],
        },
      },
      db: { findOne },
      logger: { warn },
    } as unknown as FrogBot;

    await expect(ensureAutonumbers(frogbot)).resolves.toBeUndefined();

    expect(warn.mock.calls).toEqual([
      ["[frogbot] Autonumber numbering failed for 'tickets.number': database unavailable"],
      ["[frogbot] Autonumber numbering failed for 'orders.ref': database unavailable"],
    ]);
  });
});
