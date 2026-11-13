import type { SanitizedFieldsPermissions } from 'payload';
import { describe, expect, it } from 'vitest';

import { canUpdateField } from '../../../../../packages/ui/src/admin/views/fieldPermissions.js';

type FieldAccess = { read?: true; update?: true; fields?: FieldsAccess };

type FieldsAccess = { [name: string]: FieldAccess | true } | true;

const permissions = (fields: FieldsAccess) => fields as SanitizedFieldsPermissions;

describe('canUpdateField', () => {
  it('allows a field the permissions allow', () => {
    expect(canUpdateField(true, 'done')).toBe(true);
    expect(canUpdateField({ done: true }, 'done')).toBe(true);
    expect(canUpdateField(permissions({ done: { read: true, update: true } }), 'done')).toBe(true);
    expect(
      canUpdateField(permissions({ progress: { fields: true, update: true } }), 'progress.done'),
    ).toBe(true);
  });

  it('denies a missing or read-only field', () => {
    expect(canUpdateField(undefined, 'done')).toBe(false);
    expect(canUpdateField({}, 'done')).toBe(false);
    expect(canUpdateField(permissions({ done: { read: true } }), 'done')).toBe(false);
  });

  it('denies a child when its parent group denies update', () => {
    expect(
      canUpdateField(permissions({ progress: { fields: true, read: true } }), 'progress.done'),
    ).toBe(false);
    expect(
      canUpdateField(
        permissions({ progress: { fields: { done: { read: true, update: true } }, read: true } }),
        'progress.done',
      ),
    ).toBe(false);
  });
});
