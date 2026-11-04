import { formsPlugin } from '@frogbotai/plugin-forms';
import type { Access, CollectionConfig } from 'frogbot';

import { buildTestConfig } from '../../__helpers/shared/buildTestConfig.js';

export const applicationsSlug = 'applications';
export const draftedSlug = 'drafted';
export const notesSlug = 'notes';
export const hookMarkerPrefix = 'test:application-hook:';
export const serverURL = 'https://apply.example.com';

type Role = 'admin' | 'staff' | 'viewer';

const role = (user: unknown): Role | undefined => (user as { role?: Role } | null)?.role;

const editApplications: Access = ({ req }) => {
  if (role(req.user) === 'admin') return true;
  if (role(req.user) === 'staff') return { owner: { equals: req.user!.id } };

  return false;
};

export const Users: CollectionConfig = {
  slug: 'users',
  auth: { useSessions: false },
  access: { create: () => true, read: () => true, update: () => true, delete: () => true },
  fields: [
    { name: 'name', type: 'text' },
    { name: 'role', type: 'select', options: ['admin', 'staff', 'viewer'], defaultValue: 'viewer' },
  ],
};

export const Applications: CollectionConfig = {
  slug: applicationsSlug,
  access: {
    read: editApplications,
    create: ({ req }) => role(req.user) === 'admin',
    update: editApplications,
    delete: ({ req }) => role(req.user) === 'admin',
  },
  hooks: {
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation !== 'update') return;

        const link = req.context.formLink;

        await req.frogbot.kv.set(`${hookMarkerPrefix}${doc.id}`, link ? String(link.id) : 'none');
      },
    ],
  },
  fields: [
    { name: 'email', type: 'email', required: true },
    { name: 'name', type: 'text' },
    { name: 'phone', type: 'text' },
    { name: 'status', type: 'text', access: { update: () => false } },
    { name: 'owner', type: 'relationship', relationTo: 'users' },
  ],
};

export const Drafted: CollectionConfig = {
  slug: draftedSlug,
  versions: { drafts: true },
  access: { read: () => true, update: () => true },
  fields: [{ name: 'title', type: 'text' }],
};

export const Notes: CollectionConfig = {
  slug: notesSlug,
  access: { read: () => true, update: ({ req }) => Boolean(req.user) },
  fields: [{ name: 'body', type: 'text' }],
};

export default buildTestConfig({
  serverURL,
  collections: [Users, Applications, Drafted, Notes],
  plugins: [formsPlugin({ collections: [applicationsSlug, draftedSlug, notesSlug] })],
});
