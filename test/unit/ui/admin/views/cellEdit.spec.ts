import type { SanitizedCollectionPermission } from 'payload';
import { describe, expect, it } from 'vitest';

import { getEditableColumns } from '../../../../../packages/ui/src/admin/views/List/cellEdit/editable.js';

const kind = (type: string) => ({ custom: { frogbot: { kind: { type } } } });

const fields = [
  { name: 'name', type: 'text' },
  { name: 'notes', type: 'textarea' },
  { name: 'email', type: 'email' },
  { name: 'amount', type: 'number', admin: kind('money') },
  { name: 'score', type: 'number', admin: kind('rating') },
  { name: 'deal', type: 'number', admin: { ...kind('autonumber'), readOnly: true } },
  { name: 'stage', type: 'select', options: ['lead', 'won'] },
  { name: 'done', type: 'checkbox' },
  { name: 'due', type: 'date' },
  { name: 'owner', type: 'relationship', relationTo: 'users' },
  { name: 'tags', type: 'relationship', relationTo: 'tags', hasMany: true },
  { name: 'labels', type: 'select', hasMany: true, options: ['a'] },
  { name: 'body', type: 'richText' },
  { name: 'kind', type: 'radio', options: ['a'] },
  { name: 'locked', type: 'text', admin: { readOnly: true } },
  { name: 'secret', type: 'text', hidden: true },
  { name: 'total', type: 'number', virtual: true },
  { name: 'margin', type: 'number' },
  {
    type: 'row',
    fields: [{ name: 'region', type: 'text' }],
  },
  {
    type: 'tabs',
    tabs: [
      { name: 'meta', fields: [{ name: 'source', type: 'text' }] },
      { label: 'More', fields: [{ name: 'phone', type: 'text', admin: kind('phone') }] },
    ],
  },
  {
    name: 'address',
    type: 'group',
    fields: [{ name: 'city', type: 'text' }],
  },
  {
    name: 'audit',
    type: 'group',
    admin: { readOnly: true },
    fields: [{ name: 'by', type: 'text' }],
  },
];

const columns = [
  'id',
  ...fields.flatMap((field) => ('name' in field && field.name ? [field.name] : [])),
  'region',
  'meta.source',
  'phone',
  'address.city',
  'audit.by',
  'createdAt',
];

const permissions = (
  fieldPermissions: SanitizedCollectionPermission['fields'] = {},
  update = true,
): SanitizedCollectionPermission =>
  ({ fields: fieldPermissions, read: true, update }) as SanitizedCollectionPermission;

describe('getEditableColumns', () => {
  const access = (update = true) => ({ create: true, read: true, update });
  const allowed = permissions({
    ...Object.fromEntries(
      columns
        .filter((name) => !name.includes('.'))
        .map((name) => [name, access(name !== 'margin')]),
    ),
    address: { ...access(), fields: { city: access() } },
    audit: { ...access(), fields: { by: access() } },
    meta: { ...access(), fields: { source: access() } },
  } as SanitizedCollectionPermission['fields']);

  it('edits every supported, writable column when editable is true', () => {
    expect(getEditableColumns({ columns, editable: true, fields, permissions: allowed })).toEqual([
      'name',
      'notes',
      'email',
      'amount',
      'score',
      'stage',
      'done',
      'due',
      'owner',
      'region',
      'meta.source',
      'phone',
      'address.city',
    ]);
  });

  it('edits only the named columns', () => {
    expect(
      getEditableColumns({
        columns,
        editable: ['stage', 'amount', 'tags', 'body'],
        fields,
        permissions: allowed,
      }),
    ).toEqual(['amount', 'stage']);
  });

  it('leaves hasMany, unsupported, read-only, hidden, virtual and denied fields plain', () => {
    const editable = getEditableColumns({ columns, editable: true, fields, permissions: allowed });

    for (const path of [
      'tags',
      'labels',
      'body',
      'kind',
      'locked',
      'secret',
      'total',
      'deal',
      'margin',
      'audit.by',
      'id',
      'createdAt',
    ]) {
      expect(editable).not.toContain(path);
    }
  });

  it('edits nothing when the view is off or the collection denies update', () => {
    expect(getEditableColumns({ columns, editable: false, fields, permissions: allowed })).toEqual(
      [],
    );
    expect(
      getEditableColumns({ columns, editable: undefined, fields, permissions: allowed }),
    ).toEqual([]);
    expect(
      getEditableColumns({ columns, editable: true, fields, permissions: permissions({}, false) }),
    ).toEqual([]);
    expect(getEditableColumns({ columns, editable: true, fields, permissions: undefined })).toEqual(
      [],
    );
  });

  it('checks update access on each group above a nested field', () => {
    const denied = permissions({
      address: { create: true, read: true, update: false, fields: { city: { update: true } } },
    } as SanitizedCollectionPermission['fields']);

    expect(
      getEditableColumns({ columns, editable: ['address.city'], fields, permissions: denied }),
    ).toEqual([]);
  });
});
