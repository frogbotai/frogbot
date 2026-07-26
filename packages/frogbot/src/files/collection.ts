import type { Access } from '../types/access.js';
import type { CollectionConfig } from '../types/collection.js';

export type DefaultFilesCollectionProps = {
  slug: string;
};

export function defaultFilesCollection({ slug }: DefaultFilesCollectionProps): CollectionConfig {
  const authenticated: Access = ({ req }) => !!req.user;

  return {
    slug,
    upload: true,
    folders: true,
    trash: true,
    admin: {
      group: 'Files',
      useAsTitle: 'filename',
      defaultColumns: ['filename', 'mimeType', 'filesize', 'updatedAt'],
    },
    access: {
      create: authenticated,
      read: authenticated,
      update: authenticated,
      delete: authenticated,
    },
    fields: [],
  };
}
