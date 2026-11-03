import type { PayloadRequest } from 'payload';
import { describe, expect, it } from 'vitest';

import {
  listImportTargets,
  sanitizeColumns,
  suggestColumns,
} from '../../../packages/plugins/plugin-import-export/src/columns/suggest.js';

const contactFields = [
  { name: 'fullName', type: 'text', label: 'Full Name' },
  { name: 'email', type: 'email' },
  { name: 'company', type: 'relationship', relationTo: 'companies' },
  { name: 'owner', type: 'relationship', relationTo: 'users' },
  { name: 'tags', type: 'relationship', relationTo: 'tags', hasMany: true },
  { name: 'pets', type: 'relationship', relationTo: ['dogs', 'cats'] },
  {
    name: 'details',
    type: 'group',
    label: 'Details',
    flattenedFields: [
      { name: 'city', type: 'text' },
      { name: 'title', type: 'text', label: { en: 'Job Title' } },
    ],
  },
  {
    name: 'address',
    type: 'group',
    flattenedFields: [{ name: 'city', type: 'text' }],
  },
  { name: 'items', type: 'array', flattenedFields: [{ name: 'name', type: 'text' }] },
  { name: 'secret', type: 'text', hidden: true },
];

const collections = {
  contacts: { config: { flattenedFields: contactFields, admin: {} } },
  companies: {
    config: {
      admin: { useAsTitle: 'name' },
      flattenedFields: [
        { name: 'name', type: 'text' },
        { name: 'domain', type: 'text' },
        { name: 'size', type: 'number' },
      ],
    },
  },
  users: {
    config: { admin: { useAsTitle: 'id' }, flattenedFields: [{ name: 'email', type: 'email' }] },
  },
  tags: {
    config: { admin: { useAsTitle: 'name' }, flattenedFields: [{ name: 'name', type: 'text' }] },
  },
};

const req = {
  i18n: { language: 'en' },
  payload: { collections },
  t: (key: string) => key,
} as unknown as PayloadRequest;

const targets = listImportTargets(req, 'contacts');

const fields = contactFields as never;

function suggest(...headers: string[]) {
  return suggestColumns({ headers, targets, fields });
}

describe('listImportTargets', () => {
  it('lists value fields, group subfields and single-collection relationships', () => {
    expect(targets.map(({ field, label }) => [field, label])).toEqual([
      ['fullName', 'Full Name'],
      ['email', 'Email'],
      ['company', 'Company'],
      ['owner', 'Owner'],
      ['tags', 'Tags'],
      ['details.city', 'Details › City'],
      ['details.title', 'Details › Job Title'],
      ['address.city', 'Address › City'],
    ]);
  });

  it('offers text, email and ID fields to match by, defaulting to useAsTitle, else ID', () => {
    const company = targets.find(({ field }) => field === 'company');
    const owner = targets.find(({ field }) => field === 'owner');

    expect(company?.relationship).toEqual({
      collection: 'companies',
      matchBy: [
        { field: 'name', label: 'Name' },
        { field: 'domain', label: 'Domain' },
        { field: 'id', label: 'ID' },
      ],
      defaultMatchBy: 'name',
    });
    expect(owner?.relationship?.defaultMatchBy).toBe('id');
  });
});

describe('suggestColumns', () => {
  it.each(['Full Name', 'full_name', 'FULL-NAME', 'fullname', 'FullName'])(
    'matches %s to a field by name or label, ignoring case, spaces, _ and -',
    (header) => {
      expect(suggest(header)).toEqual([{ header, field: 'fullName' }]);
    },
  );

  it('keeps match by ID for a header that is exactly a relationship key', () => {
    expect(suggest('company', 'tags')).toEqual([
      { header: 'company', field: 'company', matchBy: 'id' },
      { header: 'tags', field: 'tags', matchBy: 'id' },
    ]);
  });

  it('defaults a relationship matched by name or label to useAsTitle, else ID', () => {
    expect(suggest('Company', 'OWNER')).toEqual([
      { header: 'Company', field: 'company', matchBy: 'name', createMissing: false },
      { header: 'OWNER', field: 'owner', matchBy: 'id', createMissing: false },
    ]);
  });

  it('maps group fields by flattened key, full label or a unique label', () => {
    expect(suggest('details_city', 'Job Title')).toEqual([
      { header: 'details_city', field: 'details.city' },
      { header: 'Job Title', field: 'details.title' },
    ]);
    expect(suggest('Details City')).toEqual([{ header: 'Details City', field: 'details.city' }]);
  });

  it('maps FrogBot export keys with no picker field to themselves', () => {
    expect(suggest('id', 'items_0_name', 'pets_id')).toEqual([
      { header: 'id', field: 'id' },
      { header: 'items_0_name', field: 'items_0_name' },
      { header: 'pets_id', field: 'pets_id' },
    ]);
  });

  it('skips unknown, ambiguous and hidden headers, and maps each field once', () => {
    expect(suggest('Account Name', 'City', 'Secret', 'Email', 'E-mail')).toEqual([
      { header: 'Account Name', field: null },
      { header: 'City', field: null },
      { header: 'Secret', field: null },
      { header: 'Email', field: 'email' },
      { header: 'E-mail', field: null },
    ]);
  });

  it('lets an exact key win over a name match for the same field', () => {
    expect(suggest('Email', 'email')).toEqual([
      { header: 'Email', field: null },
      { header: 'email', field: 'email' },
    ]);
  });
});

describe('sanitizeColumns', () => {
  it('orders by header and drops fields, match-bys and create-missing that no longer fit', () => {
    expect(
      sanitizeColumns({
        headers: ['Company', 'Owner', 'Gone', 'items_0_name', 'New'],
        columns: [
          { header: 'items_0_name', field: 'items_0_name' },
          { header: 'Gone', field: 'removedField' },
          { header: 'Owner', field: 'owner', matchBy: 'id', createMissing: true },
          { header: 'Company', field: 'company', matchBy: 'size', createMissing: true },
        ],
        targets,
        fields,
      }),
    ).toEqual([
      { header: 'Company', field: 'company', matchBy: 'name', createMissing: true },
      { header: 'Owner', field: 'owner', matchBy: 'id', createMissing: false },
      { header: 'Gone', field: null },
      { header: 'items_0_name', field: 'items_0_name' },
      { header: 'New', field: null },
    ]);
  });
});
