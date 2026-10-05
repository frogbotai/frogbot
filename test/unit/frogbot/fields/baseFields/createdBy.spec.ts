import { describe, expect, it } from 'vitest';

import { createdByField } from '../../../../../packages/frogbot/src/fields/baseFields/createdBy/index.js';
import { itBehavesLikeASystemKind, runHook } from './systemKind.js';

const user = { collection: 'users', id: 'u1' };
const admin = { collection: 'admins', id: 'a1' };

describe('createdByField', () => {
  itBehavesLikeASystemKind({
    type: 'createdBy',
    description: 'Set by FrogBot to the user who created the record; read-only',
    make: (args) => createdByField({ name: 'createdBy', ...args }),
  });

  it('returns a single relationship with no relationTo until sanitize fills it', () => {
    const field = createdByField({ name: 'createdBy' });

    expect(field).toMatchObject({ type: 'relationship', name: 'createdBy' });
    expect('relationTo' in field).toBe(false);
    expect(field.hasMany).toBeUndefined();
  });

  it('keeps an explicit relationTo', () => {
    expect(createdByField({ name: 'createdBy', relationTo: 'admins' }).relationTo).toBe('admins');
  });
});

describe('createdByField option errors', () => {
  it.each([
    [{ hasMany: true }, 'hasMany is not supported'],
    [{ localized: true }, 'localized is not supported'],
    [{ defaultValue: 'u1' }, 'defaultValue is not supported'],
    [{ required: true }, 'required is not supported'],
    [{ access: { create: () => true } }, 'access.create is not supported'],
    [{ access: { update: () => true } }, 'access.update is not supported'],
    [{ relationTo: ['users', 'admins'] }, 'relationTo must be one collection slug'],
  ])('rejects %o at call time', (options, message) => {
    expect(() => createdByField({ name: 'createdBy', ...(options as object) })).toThrow(
      new Error(`createdByField "createdBy": ${message}`),
    );
  });
});

describe('createdByField beforeChange', () => {
  const field = createdByField({ name: 'createdBy', relationTo: 'users' });

  it.each([
    ['a supplied ID', { value: 'u9', user }, 'u9'],
    ['a supplied document', { value: { id: 'u9' }, user }, 'u9'],
    ['the signed-in user', { user }, 'u1'],
    ['no value for a user of another collection', { user: admin }, null],
    ['no value without a user', {}, null],
  ])('on create keeps %s', (_name, args, expected) => {
    expect(runHook(field, 'beforeChange', { operation: 'create', ...args })).toBe(expected);
  });

  it.each([
    ['the previous ID', { previousValue: 'u2', user }, 'u2'],
    ['the previous document', { previousValue: { id: 'u2' }, user }, 'u2'],
    ['the previous value over a sent one', { previousValue: 'u2', value: 'u9', user }, 'u2'],
    ['null when the previous value is missing', { value: 'u9', user }, null],
    ['the previous value without a user', { previousValue: 'u2' }, 'u2'],
    [
      'the previous value during an AI field run',
      { previousValue: 'u2', user, context: { frogbotAIFieldRun: {} } },
      'u2',
    ],
  ])('on update keeps %s', (_name, args, expected) => {
    expect(runHook(field, 'beforeChange', { operation: 'update', ...args })).toBe(expected);
  });

  it('reads the collection from the sanitized field', () => {
    const adminField = createdByField({ name: 'createdBy', relationTo: 'admins' });

    expect(runHook(adminField, 'beforeChange', { user: admin })).toBe('a1');
    expect(runHook(adminField, 'beforeChange', { user })).toBeNull();
  });
});
