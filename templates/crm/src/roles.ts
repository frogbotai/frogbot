import { allow, rolesPlugin } from '@frogbotai/plugin-roles';
import type { CollectionBeforeChangeHook, CollectionConfig } from 'frogbot';

/**
 * Who can do what. Everyone signed in reads everything.
 *
 * - `admin`: everything, and the only role that adds, removes or re-roles users.
 * - `manager`: creates, edits and deletes every record, and reads the audit log.
 * - `member`: creates records, which become theirs, and edits only their own, without handing them to someone else. Deletes nothing.
 *
 * New users are members. The first user, who signs up on an empty app, is an admin.
 */
export const roles = rolesPlugin({
  roles: ['admin', 'manager', 'member'],
  defaultRole: 'member',
  rolesFieldAccess: { create: allow('admin'), update: allow('admin') },
});

/** Access for a record a member owns through the `own` relationship to users. */
export function recordAccess(own: string): CollectionConfig['access'] {
  return {
    read: allow('admin', 'manager', 'member'),
    create: allow('admin', 'manager', { role: 'member', own }),
    update: allow('admin', 'manager', { role: 'member', own }),
    delete: allow('admin', 'manager'),
  };
}

/** Field access for `owner` and `assignee`: only admins and managers hand a record to someone else. */
export const reassignAccess = { update: allow('admin', 'manager') };

/** Access for shared records nobody owns, such as uploads: members add them, managers change them. */
export const sharedAccess: CollectionConfig['access'] = {
  read: allow('admin', 'manager', 'member'),
  create: allow('admin', 'manager', 'member'),
  update: allow('admin', 'manager'),
  delete: allow('admin', 'manager'),
};

/** Only admins and managers read the audit log. Nobody edits it. */
export const auditLogAccess: CollectionConfig['access'] = {
  read: allow('admin', 'manager'),
};

/** AI limits on users: only admins set a budget or a model list, so nobody lifts their own. */
export const aiLimitAccess = { create: allow('admin'), update: allow('admin') };

/** Users see each other and edit their own profile; only admins add or remove them. */
export const userAccess: CollectionConfig['access'] = {
  read: allow('admin', 'manager', 'member'),
  create: allow('admin'),
  update: allow(
    'admin',
    { role: 'manager', own: 'id' },
    { role: 'member', own: 'id' },
  ),
  delete: allow('admin'),
};

/** Makes the first user an admin, so the person who sets up the app can manage it. */
export const firstUserIsAdmin: CollectionBeforeChangeHook = async ({
  data,
  operation,
  req,
}) => {
  if (operation !== 'create') return data;

  const { docs } = await req.frogbot.find({
    collection: 'users',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    req,
  });

  return docs.length === 0 ? { ...data, roles: ['admin'] } : data;
};
