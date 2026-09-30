import type {
  AdminIcon,
  CollectionConfig,
  DashboardConfig,
  DocumentTabConfig,
  Field,
  FrogBot,
  FrogBotRequest,
  IconName,
  NavItem,
  RootAdminConfig,
  SettingsEntry,
  Widget,
} from 'frogbot';
import type { GeneratePreviewURL } from 'payload';
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
              expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

              return Boolean(req.frogbot);
            },
          },
          hooks: {
            beforeValidate: [
              ({ req, value }) => {
                expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

                return value;
              },
            ],
          },
          validate: (_, { req }) => {
            expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

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
                expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

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

const previewCollection = {
  admin: {
    preview: (doc, { locale, req, token }) => {
      expectTypeOf(doc).toEqualTypeOf<Record<string, unknown>>();
      expectTypeOf(locale).toEqualTypeOf<string>();
      expectTypeOf(token).toEqualTypeOf<null | string>();
      expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();
      expectTypeOf(req.frogbot).toEqualTypeOf<FrogBot>();

      return req.frogbot ? `/preview/${String(doc.id)}` : null;
    },
  },
  fields: [],
  slug: 'pages',
} satisfies CollectionConfig;

const invalidPreviewCollection = {
  admin: {
    preview: (_doc, { req }) => {
      // @ts-expect-error Payload is not exposed on FrogBot requests
      return req.payload ? '/preview' : null;
    },
  },
  fields: [],
  slug: 'pages',
} satisfies CollectionConfig;

type PreviewOptions = Parameters<NonNullable<NonNullable<CollectionConfig['admin']>['preview']>>[1];
type PayloadPreviewOptions = Parameters<GeneratePreviewURL>[1];

expectTypeOf(previewCollection).toMatchTypeOf<CollectionConfig>();
expectTypeOf(invalidPreviewCollection).toBeObject();
expectTypeOf<keyof PreviewOptions>().toEqualTypeOf<keyof PayloadPreviewOptions>();
expectTypeOf<PreviewOptions['req']>().toEqualTypeOf<FrogBotRequest>();
expectTypeOf<
  ReturnType<NonNullable<NonNullable<CollectionConfig['admin']>['preview']>>
>().toEqualTypeOf<ReturnType<GeneratePreviewURL>>();

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
expectTypeOf<'home'>().toExtend<AdminIcon>();
expectTypeOf<'./Icon#Icon'>().toExtend<AdminIcon>();
expectTypeOf<{ exportName: 'Icon'; path: './Icon' }>().toExtend<AdminIcon>();
expectTypeOf<AdminIcon>().not.toEqualTypeOf<string>();
expectTypeOf<Extract<AdminIcon, IconName>>().toEqualTypeOf<IconName>();
expectTypeOf<'message-square-text'>().toExtend<IconName>();
expectTypeOf<NavItem['icon']>().toEqualTypeOf<AdminIcon | undefined>();
expectTypeOf<SettingsEntry['icon']>().toEqualTypeOf<AdminIcon | undefined>();
expectTypeOf<NonNullable<CollectionConfig['admin']>['icon']>().toEqualTypeOf<
  AdminIcon | undefined
>();

const accountMenuAdmin = {
  components: {
    afterAccountMenu: ['@/components/SupportLink'],
    beforeAccountMenu: ['@/components/WorkspaceSwitcher'],
    logout: { Button: '@/components/Auth/LogoutButton' },
    settingsMenu: ['@/components/SettingsLink'],
  },
} satisfies RootAdminConfig;

expectTypeOf(accountMenuAdmin).toMatchTypeOf<RootAdminConfig>();

export const misspelledAccountMenuAdmin: RootAdminConfig = {
  components: {
    // @ts-expect-error Unknown root admin component slots are rejected.
    afterAccountMenus: ['@/components/SupportLink'],
  },
};
