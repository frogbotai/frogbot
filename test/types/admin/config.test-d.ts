import type {
  CollectionConfig,
  DashboardConfig,
  DocumentTabConfig,
  Field,
  FrogbotRequest,
  Widget,
} from 'frogbot';
import { expectTypeOf } from 'vitest';

expectTypeOf<Widget['fields']>().toEqualTypeOf<Field[] | undefined>();

const sharedField: Field = {
  name: 'heading',
  type: 'text',
  access: {
    read: ({ req }) => Boolean(req.frogbot),
  },
};

const dashboard = {
  widgets: [
    {
      Component: './Summary#Summary',
      fields: [
        sharedField,
        {
          name: 'note',
          type: 'text',
          access: {
            read: ({ req }) => {
              expectTypeOf(req).toEqualTypeOf<FrogbotRequest>();

              return Boolean(req.frogbot);
            },
          },
          hooks: {
            beforeValidate: [
              ({ req, value }) => {
                expectTypeOf(req).toEqualTypeOf<FrogbotRequest>();

                return value;
              },
            ],
          },
          validate: (_, { req }) => {
            expectTypeOf(req).toEqualTypeOf<FrogbotRequest>();

            return true;
          },
        },
      ],
      slug: 'summary',
    },
  ],
} satisfies DashboardConfig;

const tab: DocumentTabConfig = {
  condition: ({ req }) => Boolean(req.frogbot),
  label: 'Audit',
};

const collection = {
  admin: {
    components: {
      edit: {
        views: {
          audit: { Component: './Audit#Audit', path: '/audit', tab },
          default: {
            tab: {
              condition: ({ req }) => {
                expectTypeOf(req).toEqualTypeOf<FrogbotRequest>();

                return Boolean(req.frogbot);
              },
            },
          },
        },
      },
    },
  },
  fields: [sharedField],
  slug: 'posts',
} satisfies CollectionConfig;

type AdminComponents = NonNullable<NonNullable<CollectionConfig['admin']>['components']>;
type EditViews = NonNullable<NonNullable<AdminComponents['edit']>['views']>;
type EmptyView = Record<string, never>;

expectTypeOf<{ root: { tab: DocumentTabConfig } }>().toExtend<EditViews>();
expectTypeOf<{ audit: { path: '/audit' } }>().not.toExtend<EditViews>();
expectTypeOf<{ root: EmptyView; default: EmptyView }>().not.toExtend<EditViews>();
expectTypeOf<{
  default: EmptyView;
  api: EmptyView;
  version: EmptyView;
  versions: EmptyView;
  livePreview: EmptyView;
}>().toExtend<EditViews>();
expectTypeOf(dashboard).toMatchTypeOf<DashboardConfig>();
expectTypeOf(collection).toMatchTypeOf<CollectionConfig>();
