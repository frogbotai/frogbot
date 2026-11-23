import { activityField } from '@frogbotai/plugin-audit-log';
import { commentsField } from '@frogbotai/plugin-comments';
import type { CollectionConfig } from 'frogbot';
import { autonumberField, autonumberKeyField } from 'frogbot';

import { reassignAccess, recordAccess } from '../roles';
import { inheritProject, syncDoneHook } from './hooks/syncDone';

const relationId = (value: unknown) =>
  typeof value === 'object' && value !== null && 'id' in value
    ? value.id
    : value;

export const Tasks: CollectionConfig = {
  slug: 'tasks',
  access: recordAccess('assignee'),
  admin: {
    icon: 'check-list',
    useAsTitle: 'title',
    useAsDone: 'completed',
    panel: { properties: ['assignee', 'dueDate', 'project', 'status'] },
    components: {
      panel: { footer: ['@frogbotai/plugin-comments/rsc#CommentBoxFooter'] },
    },
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
  hooks: {
    beforeValidate: [inheritProject],
    beforeChange: [syncDoneHook],
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'completed', type: 'checkbox', defaultValue: false },
    {
      name: 'project',
      type: 'relationship',
      relationTo: 'projects',
      required: true,
      admin: { condition: (data) => !data?.parent },
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
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'tasks',
      filterOptions: ({ data, id }) => {
        const project = relationId(data?.project);
        const and = [
          ...(id === undefined ? [] : [{ id: { not_equals: id } }]),
          ...(project ? [{ project: { equals: project } }] : []),
        ];

        return and.length > 0 ? { and } : true;
      },
    },
    { name: 'description', type: 'textarea' },
    {
      name: 'subtasks',
      type: 'join',
      collection: 'tasks',
      on: 'parent',
      defaultSort: 'createdAt',
    },
    {
      name: 'attachments',
      type: 'upload',
      relationTo: 'files',
      hasMany: true,
    },
    {
      type: 'tabs',
      admin: { className: 'fb-pill-tabs' },
      tabs: [
        { label: 'Comments', fields: [commentsField()] },
        { label: 'Activity', fields: [activityField()] },
      ],
    },
  ],
};
