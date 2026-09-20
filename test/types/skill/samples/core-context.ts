import { sqliteAdapter } from '@frogbotai/db-sqlite';
import type { CollectionConfig, FrogbotConfig } from 'frogbot';

export type Post = {
  id: number | string;
  title: string;
  status?: 'draft' | 'published' | null;
  publishedAt?: string | null;
  synced?: boolean | null;
};

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  fields: [
    { name: 'name', type: 'text' },
    { name: 'status', type: 'select', options: ['active', 'inactive'] },
    { name: 'role', type: 'text' },
    { name: 'lastLogin', type: 'date' },
  ],
};

export const Posts: CollectionConfig = {
  slug: 'posts',
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'status', type: 'select', options: ['draft', 'published'] },
    { name: 'publishedAt', type: 'date' },
    { name: 'synced', type: 'checkbox' },
    { name: 'featured', type: 'checkbox' },
    { name: 'category', type: 'select', options: ['news', 'updates'] },
    { name: 'author', type: 'relationship', relationTo: 'users' },
    { name: 'internalNotes', type: 'textarea' },
    {
      name: 'meta',
      type: 'group',
      fields: [
        { name: 'featured', type: 'checkbox' },
        { name: 'privateLabel', type: 'text' },
      ],
    },
  ],
};

export const AuditEvents: CollectionConfig = {
  slug: 'audit-events',
  fields: [
    { name: 'action', type: 'text', required: true },
    { name: 'document', type: 'relationship', relationTo: 'posts', required: true },
  ],
};

export function createCoreConfig(): FrogbotConfig {
  return {
    secret: process.env.FROGBOT_SECRET || 'skill-sample-secret',
    db: sqliteAdapter({ client: { url: process.env.DATABASE_URL || 'file:skill.db' } }),
    collections: [Users, Posts, AuditEvents],
  };
}
