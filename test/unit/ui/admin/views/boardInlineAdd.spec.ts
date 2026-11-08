import type { Field } from 'payload';
import { describe, expect, it } from 'vitest';

import { getInlineAdd } from '../../../../../packages/ui/src/admin/views/Board/inlineAdd.js';

const title: Field = { name: 'title', type: 'text', required: true };
const status: Field = { name: 'status', type: 'select', options: ['todo', 'done'] };

const check = (
  fields: Field[],
  options: {
    auth?: unknown;
    groupBy?: string;
    permissions?: unknown;
    upload?: unknown;
    useAsTitle?: string;
  } = {},
) =>
  getInlineAdd({
    collectionConfig: {
      admin: { useAsTitle: 'useAsTitle' in options ? options.useAsTitle : 'title' },
      auth: options.auth,
      fields,
      upload: options.upload,
    } as never,
    groupBy: options.groupBy ?? 'status',
    permissions: options.permissions as never,
  });

const required = (field: Partial<Field> & { name: string }) =>
  ({ type: 'text', required: true, ...field }) as Field;

describe('getInlineAdd', () => {
  it('adds inline when the title is the only required field', () => {
    expect(check([title, status])).toEqual({ groupRequired: false, inline: true });
  });

  it('accepts a textarea title and a title inside a row', () => {
    expect(check([{ ...title, type: 'textarea' } as Field, status]).inline).toBe(true);
    expect(check([{ type: 'row', fields: [title] }, status]).inline).toBe(true);
  });

  it('opens the form without a usable title', () => {
    expect(check([title, status], { useAsTitle: undefined }).inline).toBe(false);
    expect(check([title, status], { useAsTitle: 'id' }).inline).toBe(false);
    expect(check([{ name: 'title', type: 'number' }, status]).inline).toBe(false);
    expect(check([{ name: 'meta', type: 'group', fields: [title] }, status]).inline).toBe(false);
    expect(check([{ ...title, virtual: 'project.name' }, status]).inline).toBe(false);
  });

  it('opens the form when the user cannot create the title', () => {
    expect(check([title, status], { permissions: { fields: { status: true } } }).inline).toBe(
      false,
    );
    expect(
      check([title, status], { permissions: { fields: { status: true, title: true } } }).inline,
    ).toBe(true);
    expect(check([title, status], { permissions: { fields: true } }).inline).toBe(true);
  });

  it('opens the form when the user cannot create the group field', () => {
    const can = { create: true, read: true, update: true, validate: true };

    expect(check([title, status], { permissions: { fields: { title: can } } }).inline).toBe(false);
    expect(
      check([title, status], { permissions: { fields: { status: can, title: can } } }).inline,
    ).toBe(true);
    expect(
      check([title, { name: 'workflow', type: 'group', fields: [status] }], {
        groupBy: 'workflow.status',
        permissions: { fields: { title: true, workflow: { ...can, fields: {} } } },
      }).inline,
    ).toBe(false);
    expect(
      check([title, { name: 'workflow', type: 'group', fields: [status] }], {
        groupBy: 'workflow.status',
        permissions: { fields: { title: true, workflow: { ...can, fields: { status: can } } } },
      }).inline,
    ).toBe(true);
  });

  it('opens the form for upload and local-auth collections', () => {
    expect(check([title, status], { upload: {} }).inline).toBe(false);
    expect(check([title, status], { auth: { disableLocalStrategy: false } }).inline).toBe(false);
    expect(check([title, status], { auth: { disableLocalStrategy: true } }).inline).toBe(true);
  });

  it('opens the form for a required field with no default or beforeValidate hook', () => {
    expect(check([title, status, required({ name: 'owner' })]).inline).toBe(false);
    expect(check([title, status, required({ name: 'owner', defaultValue: 'me' })]).inline).toBe(
      true,
    );
    expect(
      check([
        title,
        status,
        required({ name: 'owner', hooks: { beforeValidate: [({ value }) => value] } }),
      ]).inline,
    ).toBe(true);
    expect(check([title, status, required({ name: 'owner', virtual: true })]).inline).toBe(true);
  });

  it('walks rows, collapsibles, tabs and groups', () => {
    const owner = required({ name: 'owner' });

    expect(check([title, status, { type: 'row', fields: [owner] }]).inline).toBe(false);
    expect(
      check([title, status, { type: 'collapsible', label: 'More', fields: [owner] }]).inline,
    ).toBe(false);
    expect(
      check([title, status, { type: 'tabs', tabs: [{ label: 'One', fields: [owner] }] }]).inline,
    ).toBe(false);
    expect(
      check([title, status, { type: 'tabs', tabs: [{ name: 'one', fields: [owner] }] }]).inline,
    ).toBe(false);
    expect(check([title, status, { name: 'meta', type: 'group', fields: [owner] }]).inline).toBe(
      false,
    );
  });

  it('skips array and blocks rows but not a required array itself', () => {
    expect(
      check([title, status, { name: 'lines', type: 'array', fields: [required({ name: 'sku' })] }])
        .inline,
    ).toBe(true);
    expect(
      check([title, status, { name: 'lines', type: 'array', required: true, fields: [] }]).inline,
    ).toBe(false);
  });

  it('skips the group field, nested or not, and flags it when required', () => {
    expect(check([title, { ...status, required: true }])).toEqual({
      groupRequired: true,
      inline: true,
    });
    expect(
      check([title, { name: 'workflow', type: 'group', fields: [{ ...status, required: true }] }], {
        groupBy: 'workflow.status',
      }),
    ).toEqual({ groupRequired: true, inline: true });
    expect(
      check(
        [
          title,
          { type: 'tabs', tabs: [{ name: 'workflow', fields: [{ ...status, required: true }] }] },
        ],
        { groupBy: 'workflow.status' },
      ),
    ).toEqual({ groupRequired: true, inline: true });
  });
});
