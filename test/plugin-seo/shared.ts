import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@frogbotai/plugin-seo/fields';
import type { GenerateTitle } from '@frogbotai/plugin-seo/types';
import type { CollectionConfig } from 'frogbot';

import { openAccess } from '../__helpers/shared/buildTestConfig.js';

export const usersSlug = 'users';
export const postsSlug = 'posts';
export const pagesSlug = 'pages';
export const mediaSlug = 'media';
export const draftsSlug = 'drafts';
export const generateTitlePath = '/api/plugin-seo/generate-title';

export const credentials = {
  email: 'seo-editor@frogbot.local',
  password: 'frogbot-seo-test',
};

export const generationRequests: { hasFrogBot: boolean; userEmail?: string }[] = [];

export const generateTitle: GenerateTitle<typeof pagesSlug | typeof postsSlug> = ({
  collectionSlug,
  doc,
  req,
}) => {
  generationRequests.push({
    hasFrogBot: typeof req.frogbot?.find === 'function',
    userEmail: req.user?.email,
  });

  return `${collectionSlug}: ${doc.title}`;
};

export function createCollections(): CollectionConfig[] {
  return [
    {
      slug: usersSlug,
      auth: true,
      access: openAccess,
      fields: [],
    },
    {
      slug: postsSlug,
      access: {
        ...openAccess,
        create: ({ req }) => req.user?.email === credentials.email,
      },
      fields: [{ name: 'title', type: 'text', required: true }],
    },
    {
      slug: pagesSlug,
      access: openAccess,
      fields: [
        {
          type: 'tabs',
          tabs: [
            {
              label: 'Content',
              fields: [{ name: 'title', type: 'text', required: true }],
            },
            {
              name: 'meta',
              label: 'Search',
              fields: [
                OverviewField({}),
                MetaTitleField({ hasGenerateFn: true }),
                MetaDescriptionField({}),
                MetaImageField({ relationTo: mediaSlug }),
                PreviewField({}),
              ],
            },
          ],
        },
      ],
    },
    {
      slug: mediaSlug,
      access: openAccess,
      upload: { disableLocalStorage: true },
      fields: [{ name: 'alt', type: 'text' }],
    },
    {
      slug: draftsSlug,
      access: openAccess,
      fields: [{ name: 'title', type: 'text', required: true }],
    },
  ];
}

type SEOTestField = {
  name?: string;
  fields?: SEOTestField[];
  tabs?: { name?: string; fields: SEOTestField[]; label?: unknown }[];
};

export function countMeta(fields: SEOTestField[]): number {
  return fields.reduce(
    (count, field) =>
      count +
      Number(field.name === 'meta') +
      countMeta(field.fields ?? []) +
      (field.tabs?.reduce(
        (total, tab) => total + Number(tab.name === 'meta') + countMeta(tab.fields),
        0,
      ) ?? 0),
    0,
  );
}

export function tabLabels(fields: SEOTestField[]): unknown[] {
  return fields.flatMap((field) => [
    ...tabLabels(field.fields ?? []),
    ...(field.tabs?.flatMap((tab) => [tab.label, ...tabLabels(tab.fields)]) ?? []),
  ]);
}
