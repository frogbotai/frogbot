import type { Access, CollectionConfig } from 'frogbot';

export function createCapturesCollection(slug: string, access?: Access): CollectionConfig {
  const immutable = () => false;
  return {
    slug,
    labels: { singular: 'AI Capture', plural: 'AI Captures' },
    timestamps: false,
    access: { create: immutable, update: immutable, delete: immutable, read: access },
    admin: {
      useAsTitle: 'captureId',
      views: [
        {
          type: 'list',
          defaultFields: ['requestId', 'operation', 'model', 'status', 'requestedAt'],
        },
      ],
    },
    fields: [
      { name: 'captureId', type: 'text', required: true, unique: true, index: true },
      { name: 'requestId', type: 'text', required: true, index: true },
      { name: 'user', type: 'text', index: true },
      { name: 'apiKey', type: 'text', index: true },
      { name: 'operation', type: 'text', required: true, index: true },
      { name: 'model', type: 'text', required: true, index: true },
      { name: 'blobKey', type: 'text', required: true, unique: true },
      { name: 'sizeBytes', type: 'number', required: true },
      {
        name: 'status',
        type: 'select',
        required: true,
        options: ['success', 'error'],
        index: true,
      },
      { name: 'requestedAt', type: 'date', required: true, index: true },
      { name: 'completedAt', type: 'date', required: true },
    ],
  };
}
