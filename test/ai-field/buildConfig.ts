import type { CollectionConfig, FrogBotConfig } from 'frogbot';
import { aiField, lastModifiedByField } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import {
  articlesSlug,
  issuesSlug,
  modelPort,
  otherModel,
  reportsSlug,
  rollbackTitle,
  shoutsSlug,
  sharedTitle,
  tasksSlug,
  usersSlug,
  writerModel,
} from './shared.js';

type Access = NonNullable<CollectionConfig['access']>['read'];

const role = (user: unknown) => (user as { role?: string } | null)?.role;

const notBlind: Access = ({ req }) => role(req.user) !== 'blind';

const canUpdate: Access = ({ req }) => {
  if (role(req.user) === 'author') return { title: { not_equals: sharedTitle } };

  return ['admin', 'editor', 'blind'].includes(role(req.user) ?? '');
};

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  access: openAccess,
  fields: [
    {
      name: 'role',
      type: 'select',
      options: ['admin', 'editor', 'author', 'viewer', 'blind'],
      defaultValue: 'editor',
    },
  ],
};

const Tasks: CollectionConfig = {
  slug: tasksSlug,
  access: { create: () => true, delete: () => true, read: notBlind, update: canUpdate },
  hooks: {
    afterChange: [
      ({ doc }) => {
        if (doc.title === rollbackTitle) throw new Error('Rolled back on purpose.');

        return doc;
      },
    ],
  },
  fields: [
    { name: 'title', type: 'text' },
    { name: 'notes', type: 'text' },
    { name: 'priority', type: 'number' },
    {
      name: 'secret',
      type: 'text',
      access: { read: ({ req }) => !req.user || role(req.user) === 'admin' },
    },
    aiField({ name: 'summary', inputs: ['title', 'notes', 'secret'], prompt: 'Summarize.' }),
    aiField({
      name: 'category',
      inputs: ['summary'],
      prompt: 'Categorize.',
      model: `test/${otherModel}`,
    }),
    lastModifiedByField({ name: 'lastModifiedBy' }),
  ],
};

const Articles: CollectionConfig = {
  slug: articlesSlug,
  access: openAccess,
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text' },
    { name: 'body', type: 'text', localized: true },
    aiField({ name: 'summary', inputs: ['body'], prompt: 'Summarize.', localized: true }),
  ],
};

const Issues: CollectionConfig = {
  slug: issuesSlug,
  access: openAccess,
  fields: [
    { name: 'notes', type: 'text' },
    aiField({
      name: 'type',
      inputs: ['notes'],
      prompt: 'Classify.',
      options: ['bug', 'feature', 'question'],
    }),
  ],
};

const Reports: CollectionConfig = {
  slug: reportsSlug,
  access: openAccess,
  fields: [
    { name: 'body', type: 'text' },
    aiField({
      name: 'labels',
      inputs: ['body'],
      prompt: 'Label.',
      options: ['ui', 'api', 'docs'],
      hasMany: true,
    }),
  ],
};

const Shouts: CollectionConfig = {
  slug: shoutsSlug,
  access: openAccess,
  hooks: {
    afterRead: [
      ({ doc }) => ({
        ...doc,
        ...(typeof doc.loud === 'string' && { loud: doc.loud.toUpperCase() }),
      }),
    ],
  },
  fields: [
    { name: 'loud', type: 'text' },
    {
      name: 'masked',
      type: 'text',
      hooks: {
        afterRead: [({ overrideAccess, value }) => (overrideAccess || !value ? value : '***')],
      },
    },
    aiField({ name: 'summary', inputs: ['loud', 'masked'], prompt: 'Summarize.' }),
  ],
};

export function buildAIFieldConfig(jobs: FrogBotConfig['jobs'] = {}) {
  return buildTestConfig({
    collections: [Users, Tasks, Articles, Issues, Reports, Shouts],
    localization: { locales: ['en', 'fr'], defaultLocale: 'en' },
    jobs: { shouldAutoRun: () => false, ...jobs },
    ai: {
      defaultModel: `test/${writerModel}`,
      providers: {
        test: {
          type: 'openai-compatible',
          baseUrl: `http://127.0.0.1:${modelPort}/v1`,
          apiKey: 'test-key',
          models: [
            { id: writerModel, mode: 'chat' },
            { id: otherModel, mode: 'chat' },
          ],
        },
      },
    },
  });
}
