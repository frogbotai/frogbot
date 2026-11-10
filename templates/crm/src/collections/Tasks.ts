import type { CollectionConfig } from 'frogbot';

export const Tasks: CollectionConfig = {
  slug: 'tasks',
  admin: {
    icon: 'check-list',
    useAsTitle: 'title',
    useAsDone: 'completed',
    panel: {
      properties: [
        'status',
        'priority',
        'dueDate',
        'assignee',
        'deal',
        'contact',
      ],
    },
    views: [
      {
        type: 'list',
        defaultFields: [
          'title',
          'status',
          'priority',
          'completed',
          'dueDate',
          'assignee',
          'deal',
        ],
        editable: ['status', 'priority', 'completed', 'dueDate', 'assignee'],
      },
      {
        type: 'board',
        groupBy: 'status',
        defaultFields: ['title', 'priority', 'dueDate', 'assignee'],
      },
      {
        type: 'calendar',
        start: 'dueDate',
        defaultFields: ['status', 'priority'],
      },
    ],
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'todo',
      options: [
        { label: 'To do', value: 'todo', color: 'gray' },
        { label: 'In progress', value: 'in-progress', color: 'blue' },
        { label: 'Waiting', value: 'waiting', color: 'yellow' },
        { label: 'Done', value: 'done', color: 'green' },
      ],
    },
    {
      name: 'priority',
      type: 'select',
      defaultValue: 'medium',
      options: [
        { label: 'Low', value: 'low', color: 'gray' },
        { label: 'Medium', value: 'medium', color: 'blue' },
        { label: 'High', value: 'high', color: 'red' },
      ],
    },
    { name: 'completed', type: 'checkbox', defaultValue: false },
    {
      name: 'dueDate',
      type: 'date',
      admin: {
        date: { pickerAppearance: 'dayOnly', displayFormat: 'MMM d, yyyy' },
      },
    },
    { name: 'assignee', type: 'relationship', relationTo: 'users' },
    { name: 'deal', type: 'relationship', relationTo: 'deals' },
    { name: 'contact', type: 'relationship', relationTo: 'contacts' },
    { name: 'notes', type: 'textarea' },
  ],
};
