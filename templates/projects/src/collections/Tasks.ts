import type { CollectionConfig } from 'frogbot';
import { autonumberField, autonumberKeyField } from 'frogbot';

export const Tasks: CollectionConfig = {
  slug: 'tasks',
  admin: {
    useAsTitle: 'title',
    views: [
      {
        type: 'list',
        defaultFields: [
          'key',
          'title',
          'project',
          'status',
          'assignee',
          'dueDate',
        ],
      },
      {
        type: 'board',
        groupBy: 'status',
        defaultFields: ['key', 'title', 'assignee', 'dueDate'],
      },
    ],
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'project',
      type: 'relationship',
      relationTo: 'projects',
      required: true,
    },
    autonumberField({ name: 'number', scope: 'project' }),
    autonumberKeyField({ name: 'key', number: 'number', prefix: 'key' }),
    {
      name: 'status',
      type: 'select',
      defaultValue: 'todo',
      options: [
        { label: 'To do', value: 'todo' },
        { label: 'In progress', value: 'in-progress' },
        { label: 'In review', value: 'in-review' },
        { label: 'Done', value: 'done' },
      ],
    },
    { name: 'assignee', type: 'relationship', relationTo: 'users' },
    { name: 'dueDate', type: 'date' },
    { name: 'description', type: 'textarea' },
  ],
};
