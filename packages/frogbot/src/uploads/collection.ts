import type { Access } from '../collections/config/types.js';
import type { CollectionConfig } from '../collections/config/types.js';

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
      icon: 'file',
      group: 'Files',
      useAsTitle: 'filename',
      views: [
        {
          type: 'list',
          defaultFields: ['filename', 'mimeType', 'filesize', 'updatedAt'],
        },
      ],
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
