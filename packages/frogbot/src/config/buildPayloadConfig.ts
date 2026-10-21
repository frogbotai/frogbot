import type { Config as PayloadConfig, PayloadEmailAdapter } from 'payload';

import {
  CREATE_FIRST_USER_VIEW,
  fillViewMeta,
  navSections,
  sanitizeSettings,
  SETTINGS_VIEW,
  wrapDashboard,
} from '../admin/config/sanitize.js';
import type { RootAdminMetaConfig } from '../admin/types.js';
import { buildAgentEndpoints } from '../agents/endpoints.js';
import { buildManifestEndpoint } from '../chat/manifest.js';
import { resolveUserSlug } from '../chat/resolveUserSlug.js';
import { sanitizeCollection } from '../collections/config/sanitize.js';
import type { Endpoint } from '../endpoints/types.js';
import { defaultAutonumbersCollection } from '../fields/baseFields/autonumber/collection.js';
import { sanitizeVectorFields } from '../fields/config/sanitizeVector.js';
import { wrapFieldRequestFunctions } from '../fields/config/wrapRequestFunctions.js';
import { buildResumeEndpoints } from '../jobs/endpoints/resume.js';
import { pieceEmailAdapter } from '../pieces/email.js';
import { toPayloadConfig, toPayloadFields } from '../seams/config.js';
import { buildSearchQueries } from '../search/graphQL.js';
import type { SearchCollection } from '../search/types.js';
import type { AutonumberEntry } from './sanitized.js';
import { resolveSourceDir } from './sourceDir.js';
import type { FrogBotConfig } from './types.js';
import { wrapGraphQLExtension } from './wrapGraphQLExtension.js';
import {
  type AttachFrogBot,
  type ResolveFrogBot,
  wrapEndpointList,
  wrapLivePreview,
  wrapLocalization,
  wrapRootHooks,
} from './wrapRequest.js';

const noopEmailAdapter: PayloadEmailAdapter<void> = ({ payload }) => ({
  name: 'frogbot-noop',
  defaultFromAddress: 'noop@frogbot.local',
  defaultFromName: 'FrogBot',
  sendEmail(message) {
    payload.logger.warn(
      `[frogbot] Email attempted without a configured adapter. To: '${String(message.to)}', Subject: '${String(message.subject)}'. ` +
        `Configure an email adapter to send real emails.`,
    );

    return Promise.resolve();
  },
});

export function buildPayloadConfig({
  config,
  onInit,
  internalEndpoints = [],
  attachFrogBot,
  resolveFrogBot,
  searchCollections = [],
  autonumbers = [],
  storage = [],
}: {
  config: FrogBotConfig;
  onInit: NonNullable<PayloadConfig['onInit']>;
  internalEndpoints?: Endpoint[];
  attachFrogBot: AttachFrogBot;
  resolveFrogBot: ResolveFrogBot;
  searchCollections?: SearchCollection[];
  autonumbers?: AutonumberEntry[];
  storage?: NonNullable<PayloadConfig['storage']>;
}): PayloadConfig {
  const mapVectorField = config.db.mapVectorField;

  const collections = config.collections.map((collection) =>
    sanitizeCollection(
      collection.auth && !collection.admin?.icon
        ? { ...collection, admin: { ...collection.admin, icon: 'people' } }
        : collection,
      attachFrogBot,
      {
        mapVectorField,
        onAutonumber: (path) => autonumbers.push({ collection: collection.slug, path }),
        resolveFrogBot,
        search: searchCollections.find(({ slug }) => slug === collection.slug)?.search,
      },
    ),
  );

  if (!collections.some((collection) => Boolean(collection.auth))) {
    collections.push(
      sanitizeCollection(
        {
          slug: 'users',
          authorship: false,
          custom: { frogbot: { internal: true } },
          admin: { icon: 'people', useAsTitle: 'name' },
          auth: { tokenExpiration: 7200 },
          fields: [{ name: 'name', type: 'text' }],
        },
        attachFrogBot,
        { mapVectorField, resolveFrogBot },
      ),
    );
  }

  if (autonumbers.length) {
    collections.push(
      sanitizeCollection(defaultAutonumbersCollection(), attachFrogBot, {
        mapVectorField,
        resolveFrogBot,
      }),
    );
  }

  const {
    _payloadPlugins: payloadPlugins,
    agents: _agents,
    ai: _ai,
    connections: _connections,
    email: _email,
    onInit: _onInit,
    plugins: _plugins,
    settings: _settings,
    storage: _storage,
    tools: _tools,
    ...payloadKeys
  } = config;

  const out: PayloadConfig = {
    ...toPayloadConfig(payloadKeys),
    ...(config.blocks
      ? {
          blocks: config.blocks.map((block) => ({
            ...block,
            fields: toPayloadFields(
              wrapFieldRequestFunctions(
                sanitizeVectorFields({
                  block: block.slug,
                  fields: block.fields,
                  mapVectorField,
                }),
              ),
            ),
          })),
        }
      : {}),
    collections,
    hooks: wrapRootHooks(config.hooks, attachFrogBot),
    ...(config.localization !== undefined
      ? { localization: wrapLocalization(config.localization, attachFrogBot) }
      : {}),
    routes: {
      ...config.routes,
      admin: config.routes?.admin ?? '/',
    },
  };

  if (collections.some((collection) => collection.custom?.frogbot?.signIn?.length)) {
    const adapter = config.db as PayloadConfig['db'];
    const db: PayloadConfig['db'] = {
      ...adapter,
      init(args) {
        const database = adapter.init(args);
        if (
          database.name === 'sqlite' &&
          (!('transactionOptions' in database) || !database.transactionOptions)
        ) {
          throw new Error(
            '[frogbot] SQLite signIn requires transactions. Remove transactionOptions: false or set transactionOptions: {} in sqliteAdapter().',
          );
        }

        return database;
      },
    };

    out.db = db;
  }

  const userEndpoints: unknown = config.endpoints;
  const agentEndpoints = config.agents?.length ? buildAgentEndpoints() : [];
  const allEndpoints = [
    ...buildResumeEndpoints(),
    ...(Array.isArray(userEndpoints) ? (config.endpoints ?? []) : []),
    buildManifestEndpoint(),
    ...agentEndpoints,
    ...internalEndpoints,
  ];

  out.endpoints = wrapEndpointList(allEndpoints, attachFrogBot);

  if (config.graphQL || searchCollections.length) {
    const queries = wrapGraphQLExtension(config.graphQL?.queries, attachFrogBot);
    const mutations = wrapGraphQLExtension(config.graphQL?.mutations, attachFrogBot);

    const searchQueries = searchCollections.length
      ? buildSearchQueries({
          attachFrogBot,
          collections: searchCollections.map(({ slug }) => slug),
        })
      : undefined;

    const graphQL: PayloadConfig['graphQL'] = {
      ...config.graphQL,
      ...(searchQueries || queries
        ? {
            queries: (graphQLModule, context) => ({
              ...searchQueries?.(graphQLModule, context),
              ...queries?.(graphQLModule, context),
            }),
          }
        : {}),
      ...(mutations ? { mutations } : {}),
    };

    out.graphQL = graphQL;
  }

  out.email =
    config.email === undefined
      ? noopEmailAdapter
      : config.email instanceof Promise
        ? config.email.then(pieceEmailAdapter)
        : pieceEmailAdapter(config.email);

  out.typescript = {
    ...(config as { typescript?: Record<string, unknown> }).typescript,
    autoGenerate: false,
  };

  out.cookiePrefix = config.cookiePrefix ?? 'frogbot';

  const { admin } = config;
  const settings = sanitizeSettings(config.settings);
  const { dashboard, livePreview, ...adminRest } = admin ?? {};
  const adaptedDashboard = dashboard ? wrapDashboard(dashboard, attachFrogBot) : undefined;
  const hasAdminSignIn = config.collections.some(
    ({ slug, auth }) =>
      typeof auth === 'object' && auth.signIn?.length && slug === resolveUserSlug(config),
  );

  const toolComponents = Object.fromEntries(
    (config.agents ?? []).flatMap((agent) => {
      const components = Object.fromEntries(
        (agent.tools ?? []).flatMap((tool) =>
          'component' in tool && tool.component !== undefined ? [[tool.slug, tool.component]] : [],
        ),
      );

      return Object.keys(components).length > 0 ? [[agent.slug, components]] : [];
    }),
  );

  const adminMeta: RootAdminMetaConfig = {
    defaultOGImageType: 'static',
    titleSuffix: '- FrogBot',
    ...admin?.meta,
    openGraph: {
      description:
        'FrogBot is an open-source AI agent framework you configure in one TypeScript file, then deploy anywhere or run as a Docker image.',
      siteName: 'FrogBot',
      ...admin?.meta?.openGraph,
    },
  };

  out.admin = {
    ...adminRest,
    ...(livePreview ? { livePreview: wrapLivePreview(livePreview, attachFrogBot) } : {}),
    ...(adaptedDashboard ? { dashboard: adaptedDashboard } : {}),
    components: {
      ...admin?.components,
      ...(hasAdminSignIn
        ? {
            afterLogin: [
              ...(admin?.components?.afterLogin ?? []),
              '@frogbotai/ui/admin/rsc#SignInButtons',
            ],
          }
        : {}),
      ...(admin?.components?.chat || Object.keys(toolComponents).length > 0
        ? {
            chat: {
              ...admin?.components?.chat,
              ...(Object.keys(toolComponents).length > 0 ? { toolComponents } : {}),
            },
          }
        : {}),
      Nav: admin?.components?.Nav ?? '@frogbotai/ui/admin/rsc#FrogBotNav',
      ...navSections(admin?.components?.navSections),
      providers: [...(admin?.components?.providers ?? []), '@frogbotai/ui/admin#StepNavReset'],
      graphics: {
        Icon: '@frogbotai/ui/admin/rsc#FrogBotIcon',
        Logo: '@frogbotai/ui/admin/rsc#FrogBotLogo',
        ...admin?.components?.graphics,
      },
      views: Object.fromEntries(
        Object.entries({
          ...admin?.components?.views,
          ...(hasAdminSignIn
            ? {
                createFirstUser:
                  admin?.components?.views?.createFirstUser ?? CREATE_FIRST_USER_VIEW,
              }
            : {}),
          settings: admin?.components?.views?.settings ?? SETTINGS_VIEW,
        }).map(([key, view]) => [
          key,
          key === 'account' ||
          key === 'dashboard' ||
          view === CREATE_FIRST_USER_VIEW ||
          typeof view !== 'object' ||
          view === null ||
          Array.isArray(view)
            ? view
            : fillViewMeta(view, adminMeta),
        ]),
      ),
    },
    meta: adminMeta,
    importMap: {
      baseDir: resolveSourceDir(process.cwd()),
      ...admin?.importMap,
      autoGenerate: false,
    },
    ...{ settings },
  };

  const i18n = (
    config as {
      i18n?: { translations?: Record<string, unknown> } & Record<string, unknown>;
    }
  ).i18n;

  const en = i18n?.translations?.en as
    ({ general?: Record<string, unknown> } & Record<string, unknown>) | undefined;

  out.i18n = {
    ...i18n,
    translations: {
      ...i18n?.translations,
      en: {
        ...en,
        general: {
          payloadSettings: 'FrogBot Settings',
          ...en?.general,
        },
      },
    },
  };

  if (payloadPlugins?.length) out.plugins = payloadPlugins;
  if (storage.length) out.storage = storage;
  out.onInit = onInit;

  return out;
}
