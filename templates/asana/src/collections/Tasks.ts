import { activityField } from '@frogbotai/plugin-audit-log';
import { commentsField } from '@frogbotai/plugin-comments';
import type { CollectionConfig, Where } from 'frogbot';
import { autonumberField, autonumberKeyField } from 'frogbot';

import {
  followParent,
  moveSubtasks,
  relationId,
  syncDoneHook,
} from '../hooks/tasks';
import { reassignAccess, recordAccess } from '../roles';

const SHORT_DATE = '@frogbotai/ui/admin#ShortDateCell';

export const Tasks: CollectionConfig = {
  slug: 'tasks',
  access: recordAccess('assignee'),
  admin: {
    icon: 'check-list',
    useAsTitle: 'title',
    useAsDone: 'completed',
    panel: {
      properties: ['assignee', 'startDate', 'dueDate', 'project', 'status'],
    },
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
        defaultFields: ['title', 'assignee', 'dueDate'],
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
    beforeValidate: [followParent],
    beforeChange: [syncDoneHook],
    afterChange: [moveSubtasks],
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'completed', type: 'checkbox', defaultValue: false },
    {
      name: 'project',
      type: 'relationship',
      relationTo: 'projects',
      required: true,
      admin: {
        allowEdit: false,
        condition: (data) => !data?.parent,
        placeholder: 'No project',
      },
    },
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
      admin: { allowEdit: false, placeholder: 'No assignee' },
    },
    {
      name: 'dueDate',
      type: 'date',
      admin: { components: { Cell: SHORT_DATE }, placeholder: 'No due date' },
    },
    {
      name: 'description',
      type: 'textarea',
      admin: { placeholder: 'What is this task about?' },
    },
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
      name: 'startDate',
      type: 'date',
      admin: { components: { Cell: SHORT_DATE }, placeholder: 'No start date' },
    },
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'tasks',
      admin: { hidden: true },
      filterOptions: ({ data, id }) => {
        const project = relationId(data?.project);
        const and: Where[] = [];

        if (id !== undefined) and.push({ id: { not_equals: id } });
        if (project) and.push({ project: { equals: project } });

        return and.length > 0 ? { and } : true;
      },
    },
    autonumberField({
      name: 'number',
      scope: 'project',
      admin: { hidden: true },
    }),
    autonumberKeyField({
      name: 'key',
      number: 'number',
      prefix: 'key',
      admin: { condition: () => false },
    }),
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
