import type {
  AdminIcon,
  CollectionConfig,
  DashboardConfig,
  DocumentTabConfig,
  Field,
  FrogBot,
  FrogBotConfig,
  FrogBotRequest,
  IconName,
  NavItem,
  RootAdminConfig,
  SettingsEntry,
  Widget,
} from 'frogbot';
import type {
  CollectionAdminOptions,
  Config as PayloadConfig,
  GeneratePreviewURL,
  Locale,
} from 'payload';
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

type FormatDocURL = NonNullable<NonNullable<CollectionConfig['admin']>['formatDocURL']>;
type PayloadFormatDocURL = NonNullable<CollectionAdminOptions['formatDocURL']>;

const formatDocURLCollection = {
  admin: {
    formatDocURL: ({ defaultURL, doc, req }) => {
      expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();
      expectTypeOf(req.frogbot).toEqualTypeOf<FrogBot>();

      // @ts-expect-error Payload is not exposed on FrogBot requests
      void req.payload;

      return doc.private ? null : defaultURL;
    },
  },
  fields: [],
  slug: 'pages',
} satisfies CollectionConfig;

expectTypeOf(formatDocURLCollection).toMatchTypeOf<CollectionConfig>();
expectTypeOf<keyof Parameters<FormatDocURL>[0]>().toEqualTypeOf<
  keyof Parameters<PayloadFormatDocURL>[0]
>();
expectTypeOf<Parameters<FormatDocURL>[0]['req']>().toEqualTypeOf<FrogBotRequest>();
expectTypeOf<ReturnType<FormatDocURL>>().toEqualTypeOf<ReturnType<PayloadFormatDocURL>>();

type Localization = Exclude<NonNullable<FrogBotConfig['localization']>, false>;
type FilterAvailableLocales = NonNullable<Localization['filterAvailableLocales']>;
type PayloadLocalization = Exclude<NonNullable<PayloadConfig['localization']>, false>;

export const filteredLocalization: FrogBotConfig['localization'] = {
  defaultLocale: 'en',
  locales: [
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Español' },
  ],
  filterAvailableLocales: async ({ locales, req }) => {
    expectTypeOf(locales).toEqualTypeOf<Locale[]>();
    expectTypeOf(req.frogbot).toEqualTypeOf<FrogBot>();

    return locales.filter(({ code }) => code === 'en');
  },
};

export const invalidLocalization: FrogBotConfig['localization'] = {
  defaultLocale: 'en',
  locales: ['en'],
  // @ts-expect-error Payload is not exposed on FrogBot requests
  filterAvailableLocales: ({ locales, req }) => (req.payload ? locales : []),
};

expectTypeOf<keyof Localization>().toEqualTypeOf<keyof PayloadLocalization>();
expectTypeOf<Parameters<FilterAvailableLocales>[0]['req']>().toEqualTypeOf<FrogBotRequest>();

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

expectTypeOf<RootAdminConfig['autoRefresh']>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<RootAdminConfig['autoLogin']>().toEqualTypeOf<
  | false
  | { email?: string; password?: string; prefillOnly?: boolean; username?: string }
  | undefined
>();

export const autoLoginAdmin: RootAdminConfig = {
  autoLogin: { email: 'dev@example.com', password: 'dev', prefillOnly: true },
  autoRefresh: true,
};

export const misspelledAutoLoginAdmin: RootAdminConfig = {
  // @ts-expect-error autoLogin takes email or username, not user
  autoLogin: { user: 'dev@example.com' },
};
