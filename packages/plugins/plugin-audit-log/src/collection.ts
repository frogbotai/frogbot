import type { Access, CollectionConfig } from 'frogbot';

import type { AuditLogPluginOptions } from './types.js';

type CollectionOptions = Pick<AuditLogPluginOptions, 'access' | 'ipAddress'> & {
  slug: string;
  userSlug: string;
};

const loggedIn: Access = ({ req }) => Boolean(req.user);
const denied: Access = () => false;

export function createAuditLogCollection(options: CollectionOptions): CollectionConfig {
  return {
    slug: options.slug,
    admin: {
      views: [
        {
          type: 'list',
          defaultFields: ['timestamp', 'collection', 'operation', 'documentId', 'user'],
        },
      ],
    },
    access: {
      read: options.access?.read ?? loggedIn,
      create: denied,
      update: denied,
      delete: denied,
    },
    fields: [
      { name: 'collection', type: 'text', required: true, index: true },
      {
        name: 'operation',
        type: 'select',
        required: true,
        options: ['create', 'update', 'delete'],
      },
      { name: 'documentId', type: 'text', required: true, index: true },
      { name: 'user', type: 'relationship', relationTo: options.userSlug, index: true },
      { name: 'apiKeyId', type: 'text', index: true },
      { name: 'changes', type: 'json', required: true },
      { name: 'snapshot', type: 'json' },
      { name: 'timestamp', type: 'date', required: true, index: true },
      ...(options.ipAddress
        ? ([
            { name: 'ip', type: 'text' },
            { name: 'userAgent', type: 'text' },
          ] satisfies CollectionConfig['fields'])
        : []),
    ],
  };
}
