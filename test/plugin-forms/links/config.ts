import { formsPlugin } from '@frogbotai/plugin-forms';
import { type Access, APIError, type CollectionConfig, type FrogBotRequest } from 'frogbot';

import { buildTestConfig } from '../../__helpers/shared/buildTestConfig.js';

export const applicationsSlug = 'applications';
export const draftedSlug = 'drafted';
export const notesSlug = 'notes';
export const hookMarkerPrefix = 'test:application-hook:';
export const updateCountPrefix = 'test:application-updates:';
export const reachPrefix = 'test:application-reach:';
export const noteIdKey = 'test:note-id';
export const otherApplicationKey = 'test:other-application';
export const failingName = 'explode';
export const reachingName = 'reach';
export const serverURL = 'https://apply.example.com';

type Role = 'admin' | 'staff' | 'viewer';

const role = (user: unknown): Role | undefined => (user as { role?: Role } | null)?.role;

const editApplications: Access = ({ req }) => {
  if (role(req.user) === 'admin') return true;
  if (role(req.user) === 'staff') return { owner: { equals: req.user!.id } };

  return false;
};

async function attempt(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();

    return 'allowed';
  } catch (error) {
    return (error as { name?: string }).name ?? 'failed';
  }
}

async function reach(req: FrogBotRequest) {
  const note = await req.frogbot.kv.get(noteIdKey);
  const other = await req.frogbot.kv.get(otherApplicationKey);

  return {
    note: await attempt(() =>
      req.frogbot.update({
        collection: notesSlug,
        id: note as number | string,
        data: { body: 'changed through a link' },
        overrideAccess: false,
        req,
      }),
    ),
    other: await attempt(() =>
      req.frogbot.findByID({
        collection: applicationsSlug,
        id: other as number | string,
        overrideAccess: false,
        req,
      }),
    ),
  };
}

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
    beforeChange: [
      ({ data }) => {
        if (data.name === failingName) throw new APIError('The CRM refused this change.', 400);

        return data;
      },
    ],
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation !== 'update') return;

        const link = req.context.formLink;
        const count = await req.frogbot.kv.get(`${updateCountPrefix}${doc.id}`);

        await req.frogbot.kv.set(`${hookMarkerPrefix}${doc.id}`, link ? String(link.id) : 'none');
        await req.frogbot.kv.set(`${updateCountPrefix}${doc.id}`, (Number(count) || 0) + 1);

        if (doc.name === reachingName) {
          await req.frogbot.kv.set(`${reachPrefix}${doc.id}`, await reach(req));
        }
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
  plugins: [
    formsPlugin({ collections: [applicationsSlug, draftedSlug, notesSlug], trustProxy: true }),
  ],
});
