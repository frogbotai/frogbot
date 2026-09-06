import type { CollectionConfig } from 'frogbot';

export const Tasks: CollectionConfig = {
  slug: 'tasks',
  admin: {
    useAsTitle: 'title',
    views: [
      {
        type: 'list',
        defaultFields: ['title', 'stage', 'owner', 'dueDate'],
      },
      {
        type: 'board',
        defaultFields: ['title', 'owner', 'dueDate'],
        groupBy: 'stage',
      },
      {
        type: 'calendar',
        slug: 'schedule',
        start: 'dueDate',
      },
    ],
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'stage',
      type: 'select',
      options: [
        { label: 'Backlog', value: 'backlog' },
        { label: 'In progress', value: 'in-progress' },
        { label: 'Done', value: 'done' },
      ],
    },
    { name: 'owner', type: 'relationship', relationTo: 'users' },
    { name: 'dueDate', type: 'date' },
  ],
};
