import type { CollectionConfig } from 'frogbot';
import { autonumberField, autonumberKeyField } from 'frogbot';

import { reassignAccess, recordAccess } from '../roles';

export const Tasks: CollectionConfig = {
  slug: 'tasks',
  access: recordAccess('assignee'),
  admin: {
    icon: 'check-list',
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
      {
        type: 'timeline',
        start: 'startDate',
        end: 'dueDate',
        groupBy: 'project',
        color: 'status',
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
        { label: 'To do', value: 'todo', color: 'gray' },
        { label: 'In progress', value: 'in-progress', color: 'blue' },
        { label: 'In review', value: 'in-review', color: 'purple' },
        { label: 'Done', value: 'done', color: 'green' },
      ],
    },
    {
      name: 'assignee',
      type: 'relationship',
      relationTo: 'users',
      access: reassignAccess,
    },
    { name: 'startDate', type: 'date' },
    { name: 'dueDate', type: 'date' },
    { name: 'description', type: 'textarea' },
  ],
};
