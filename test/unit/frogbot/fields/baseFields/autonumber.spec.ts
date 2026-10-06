import { describe, expect, it, vi } from 'vitest';

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
