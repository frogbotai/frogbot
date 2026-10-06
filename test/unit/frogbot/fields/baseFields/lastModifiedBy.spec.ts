import { describe, expect, it } from 'vitest';

import { lastModifiedByField } from '../../../../../packages/frogbot/src/fields/baseFields/lastModifiedBy/index.js';
import { itBehavesLikeASystemKind, runHook } from './systemKind.js';

const user = { collection: 'users', id: 'u1' };
const admin = { collection: 'admins', id: 'a1' };

describe('lastModifiedByField', () => {
  itBehavesLikeASystemKind({
    type: 'lastModifiedBy',
    description: 'Set by FrogBot to the user who last saved the record; read-only',
    make: (args) => lastModifiedByField({ name: 'lastModifiedBy', ...args }),
  });

  it('returns a single relationship with no relationTo until sanitize fills it', () => {
    const field = lastModifiedByField({ name: 'lastModifiedBy' });

    expect(field).toMatchObject({ type: 'relationship', name: 'lastModifiedBy' });
    expect('relationTo' in field).toBe(false);
  });
});

describe('lastModifiedByField option errors', () => {
  it.each([
    [{ hasMany: true }, 'hasMany is not supported'],
    [{ localized: true }, 'localized is not supported'],
    [{ defaultValue: 'u1' }, 'defaultValue is not supported'],
    [{ required: true }, 'required is not supported'],
    [{ virtual: true }, 'virtual is not supported'],
    [{ access: { create: () => true } }, 'access.create is not supported'],
    [{ access: { update: () => true } }, 'access.update is not supported'],
    [{ relationTo: ['users'] }, 'relationTo must be one collection slug'],
  ])('rejects %o at call time', (options, message) => {
    expect(() => lastModifiedByField({ name: 'lastModifiedBy', ...(options as object) })).toThrow(
      new Error(`lastModifiedByField "lastModifiedBy": ${message}`),
    );
  });
});

describe('lastModifiedByField beforeChange', () => {
  const field = lastModifiedByField({ name: 'lastModifiedBy', relationTo: 'users' });

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
    ['the signed-in user', { previousValue: 'u2', user }, 'u1'],
    ['the signed-in user over a sent value', { previousValue: 'u2', value: 'u9', user }, 'u1'],
    ['the previous ID without a user', { previousValue: 'u2' }, 'u2'],
    ['the previous document without a user', { previousValue: { id: 'u2' } }, 'u2'],
    [
      'the previous value for a user of another collection',
      { previousValue: 'u2', user: admin },
      'u2',
    ],
    ['null without a user or previous value', { value: 'u9' }, null],
    [
      'the previous value during an AI field run',
      { previousValue: 'u2', user, context: { frogbotAIFieldRun: { field: 'summary' } } },
      'u2',
    ],
    [
      'the previous document during an AI field run',
      { previousValue: { id: 'u2' }, user, context: { frogbotAIFieldRun: true } },
      'u2',
    ],
  ])('on update keeps %s', (_name, args, expected) => {
    expect(runHook(field, 'beforeChange', { operation: 'update', ...args })).toBe(expected);
  });
});
