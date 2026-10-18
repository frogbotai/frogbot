import type { Access } from '../collections/config/types.js';
import type { CollectionConfig } from '../collections/config/types.js';
import { createFolderField } from '../fields/baseFields/payloadFields.js';

export const FOLDERS_SLUG = 'folders';

export type DefaultFilesCollectionProps = {
  slug: string;
  folders: string;
};

const authenticated: Access = ({ req }) => !!req.user;

const access = {
  create: authenticated,
  read: authenticated,
  update: authenticated,
  delete: authenticated,
};

/** Payload's folders collection, which the files collection files into. */
export function defaultFoldersCollection(): CollectionConfig {
  return {
    slug: FOLDERS_SLUG,
    folders: true,
    admin: { useAsTitle: 'name' },
    access,
    fields: [{ name: 'name', type: 'text', required: true }],
  };
}

export function defaultFilesCollection({
  slug,
  folders,
}: DefaultFilesCollectionProps): CollectionConfig {
  return {
    slug,
    upload: true,
    trash: true,
    admin: {
      icon: 'file',
      useAsTitle: 'filename',
      views: [
        {
          type: 'list',
          defaultFields: ['filename', 'mimeType', 'filesize', 'updatedAt'],
        },
      ],
    },
    access,
    fields: [createFolderField({ relationTo: folders })],
  };
}
