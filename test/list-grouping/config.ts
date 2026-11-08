import type { CollectionConfig } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';

const Items: CollectionConfig = {
  slug: 'items',
  access: openAccess,
  admin: {
    listSearchableFields: ['title', 'guarded'],
    useAsTitle: 'title',
    views: [{ type: 'list' }],
  },
  fields: [
    { name: 'title', type: 'text' },
    {
      name: 'status',
      type: 'select',
      options: [
        { label: { en: 'To do' }, value: 'todo' },
        { label: 'Doing', value: 'doing' },
        'done',
      ],
    },
    { name: 'tags', type: 'select', hasMany: true, options: ['red', 'blue'] },
    { name: 'flag', type: 'checkbox' },
    { name: 'city', type: 'text' },
    { name: 'owner', type: 'relationship', relationTo: 'people' },
    { name: 'link', type: 'relationship', relationTo: ['people', 'items'] },
    { name: 'guarded', type: 'text', access: { read: () => true } },
    { name: 'secret', type: 'text', access: { read: () => false } },
    { name: 'locked', type: 'select', options: ['a', 'b'], access: { create: () => false } },
    {
      name: 'meta',
      type: 'group',
      fields: [{ name: 'kind', type: 'select', options: ['a', 'b'] }],
    },
  ],
};

const People: CollectionConfig = {
  slug: 'people',
  access: openAccess,
  admin: { useAsTitle: 'name' },
  fields: [{ name: 'name', type: 'text' }],
};

const Drafts: CollectionConfig = {
  slug: 'drafted',
  access: openAccess,
  admin: { useAsTitle: 'title', views: [{ type: 'list' }] },
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text' },
    { name: 'status', type: 'select', options: ['todo', 'doing', 'done'] },
  ],
};

export default await buildTestConfig({ collections: [Items, People, Drafts] });
