import type { CollectionConfig as PayloadCollectionConfig, PayloadRequest } from 'payload';

import type { CollectionView } from '../../admin/views/types.js';
import { buildSignInEndpoints } from '../../auth/signIn/endpoints.js';
import { buildSignInStrategy } from '../../auth/signIn/strategy.js';
import { validateSignIn } from '../../auth/signIn/validate.js';
import type { AuthConfig } from '../../auth/types.js';
import {
  buildBoardOrderField,
  buildBoardOrderHook,
  compileCollectionViews,
  getBoardOrderFieldNames,
} from '../../config/collectionViews.js';
import {
  type AttachFrogBot,
  bootstrapFrogBot,
  type ResolveFrogBot,
  wrapAuthEmail,
  wrapAuthStrategies,
  wrapEndpoints,
  wrapFormatDocURL,
  wrapLivePreview,
  wrapPreview,
  wrapTabCondition,
  wrapUploadHandlers,
} from '../../config/wrapRequest.js';
import type { MapVectorField } from '../../database/types.js';
import { withAIFieldSelect } from '../../fields/baseFields/ai/select.js';
import { sanitizeVectorFields } from '../../fields/config/sanitizeVector.js';
import { wrapFieldRequestFunctions } from '../../fields/config/wrapRequestFunctions.js';
import { pieceInstanceDefinition } from '../../pieces/definePiece.js';
import { toPayloadCollectionConfig, toPayloadFields } from '../../seams/config.js';
import { buildSearchEndpoints } from '../../search/endpoints.js';
import type { SearchIndexDescriptors } from '../../search/types.js';
import { isRecord } from '../../utilities/isRecord.js';
import type { CollectionAdminComponents, CollectionConfig } from './types.js';

const SAME_SITE = { lax: 'Lax', none: 'None', strict: 'Strict' } as const;

type PayloadCookies = PayloadAuth['cookies'];

function toPayloadCookies({
  sameSite,
  ...cookies
}: NonNullable<AuthConfig['cookies']>): PayloadCookies {
  return { ...cookies, ...(sameSite ? { sameSite: SAME_SITE[sameSite] } : {}) };
}

type PayloadAuth = Exclude<NonNullable<PayloadCollectionConfig['auth']>, boolean>;

type PayloadEditViews = NonNullable<
  NonNullable<NonNullable<PayloadCollectionConfig['admin']>['components']>['views']
>['edit'];

type SourceEditViews = NonNullable<NonNullable<CollectionAdminComponents['edit']>['views']>;

function wrapTabConditions(
  editViews: NonNullable<PayloadEditViews>,
  sourceEditViews: SourceEditViews,
): PayloadEditViews {
  const conditions = new Map(
    Object.entries(sourceEditViews).flatMap(([key, view]) =>
      typeof view?.tab?.condition === 'function' ? [[key, view.tab.condition] as const] : [],
    ),
  );

  const wrapped = Object.entries(editViews).flatMap(([key, view]) => {
    const condition = conditions.get(key);

    return view?.tab && condition
      ? [[key, { ...view, tab: { ...view.tab, condition: wrapTabCondition(condition) } }]]
      : [];
  });

  return wrapped.length ? { ...editViews, ...Object.fromEntries(wrapped) } : editViews;
}

function toPayloadLoginWithUsername(
  loginWithUsername: NonNullable<AuthConfig['loginWithUsername']>,
): PayloadAuth['loginWithUsername'] {
  if (typeof loginWithUsername === 'boolean') return loginWithUsername;

  const { allowEmailLogin, ...rest } = loginWithUsername;

  return allowEmailLogin === false
    ? { ...rest, allowEmailLogin, requireUsername: true }
    : { ...rest, ...(allowEmailLogin ? { allowEmailLogin } : {}) };
}

type PayloadCollectionAccess = NonNullable<PayloadCollectionConfig['access']>;

function wrapCollectionAccessFunction<TArgs extends { req?: PayloadRequest }, TResult>(
  access: (args: TArgs) => Promise<TResult> | TResult,
  attachFrogBot: AttachFrogBot,
): (args: TArgs) => Promise<TResult> {
  return async (args) => {
    if (args.req?.payload) await attachFrogBot(args.req);

    return access(args);
  };
}

export function wrapCollectionAccess(
  collection: PayloadCollectionConfig,
  attachFrogBot: AttachFrogBot,
): void {
  const accessConfig = collection.access;

  if (!accessConfig) return;

  const operations = Object.keys(accessConfig) as (keyof PayloadCollectionAccess)[];

  for (const operation of operations) {
    if (operation === 'admin') {
      const { admin } = accessConfig;

      if (typeof admin === 'function') {
        accessConfig.admin = wrapCollectionAccessFunction(admin, attachFrogBot);
      }

      continue;
    }

    const access = accessConfig[operation];

    if (typeof access !== 'function') continue;

    accessConfig[operation] = wrapCollectionAccessFunction(access, attachFrogBot);
  }
}

export function sanitizeCollection(
  c: CollectionConfig,
  attachFrogBot: AttachFrogBot,
  {
    mapVectorField,
    onAutonumber,
    search,
    resolveFrogBot,
  }: {
    mapVectorField?: MapVectorField;
    onAutonumber?: (path: string) => void;
    search?: SearchIndexDescriptors;
    resolveFrogBot: ResolveFrogBot;
  },
): PayloadCollectionConfig {
  const signIn = validateSignIn(c);
  let collectionViews: CollectionView[] = [];
  const admin = compileCollectionViews({
    collection: c,
    onRuntimeViews: (views) => {
      collectionViews = views;
    },
  });

  if (admin?.livePreview) {
    admin.livePreview = wrapLivePreview(c.admin?.livePreview, attachFrogBot);
  }

  if (admin && typeof c.admin?.preview === 'function') {
    admin.preview = wrapPreview(c.admin.preview, attachFrogBot);
  }

  if (admin && typeof c.admin?.formatDocURL === 'function') {
    admin.formatDocURL = wrapFormatDocURL(c.admin.formatDocURL);
  }

  const editViews = admin?.components?.views?.edit;
  const sourceEditViews = c.admin?.components?.edit?.views;
  if (admin?.components?.views && editViews && sourceEditViews) {
    admin.components.views.edit = wrapTabConditions(editViews, sourceEditViews);
  }

  const views = admin?.components?.views;
  const orderFieldNames = getBoardOrderFieldNames(c);
  const {
    chat: _chat,
    file: _file,
    message: _message,
    usageLog: _usageLog,
    search: _searchConfig,
    ...collection
  } = c;

  const base = toPayloadCollectionConfig(collection);
  const select = withAIFieldSelect(c.fields, base.select);
  const existingHooks = base.hooks ?? {};
  const out: PayloadCollectionConfig = {
    ...base,
    fields: toPayloadFields(
      wrapFieldRequestFunctions(
        sanitizeVectorFields({
          collection: c.slug,
          fields: [...c.fields, ...orderFieldNames.map(buildBoardOrderField)],
          mapVectorField,
          onAutonumber,
        }),
      ),
    ),
    ...(admin ? { admin } : {}),
    ...(select ? { select } : {}),
    ...(typeof c.upload === 'object' && c.upload.handlers
      ? {
          upload: {
            ...c.upload,
            handlers: wrapUploadHandlers(c.upload.handlers, attachFrogBot),
          },
        }
      : {}),
    ...(orderFieldNames.length
      ? {
          orderable: true,
        }
      : {}),
    ...(c.chat === true
      ? {
          admin: {
            ...admin,
            components: {
              ...admin?.components,
              views: {
                ...views,
                edit: views?.edit?.root
                  ? views.edit
                  : { root: { Component: '@frogbotai/ui/admin/rsc#ChatView' } },
              },
            },
          },
        }
      : {}),
  };

  const auth = c.auth !== undefined && c.auth !== false;

  if (auth && c.versions === undefined) out.versions = false;

  if (typeof c.auth === 'object') {
    const {
      signIn: _signIn,
      strategies,
      cookies,
      forgotPassword,
      loginWithUsername,
      verify,
      ...collectionAuth
    } = c.auth;

    const sessionStrategy =
      signIn.length && c.auth.disableLocalStrategy ? [buildSignInStrategy(c.slug)] : [];

    out.auth = {
      ...collectionAuth,
      ...(loginWithUsername !== undefined
        ? { loginWithUsername: toPayloadLoginWithUsername(loginWithUsername) }
        : {}),
      ...(cookies ? { cookies: toPayloadCookies(cookies) } : {}),
      ...(verify !== undefined
        ? { verify: typeof verify === 'object' ? wrapAuthEmail(verify, attachFrogBot) : verify }
        : {}),
      ...(forgotPassword ? { forgotPassword: wrapAuthEmail(forgotPassword, attachFrogBot) } : {}),
      ...(strategies || sessionStrategy.length
        ? {
            strategies: [
              ...wrapAuthStrategies({
                collection: c.slug,
                strategies: strategies ?? [],
                resolveFrogBot,
              }),
              ...sessionStrategy,
            ],
          }
        : {}),
    };
  }

  const existingCustom = (c.custom ?? {}) as Record<string, unknown>;
  const {
    auth: _auth,
    collectionViews: _collectionViews,
    search: _search,
    signIn: _customSignIn,
    ...existingFrogBot
  } = isRecord(existingCustom.frogbot) ? existingCustom.frogbot : {};

  out.custom = {
    ...existingCustom,
    frogbot: {
      ...existingFrogBot,
      auth,
      collectionViews,
      ...(search ? { search } : {}),
      ...(signIn.length
        ? {
            signIn: signIn.map((method) => ({
              slug: method.slug,
              piece: method.piece,
              label: pieceInstanceDefinition(method).label,
            })),
          }
        : {}),
    },
  };

  const setupFrogBot = (args: { req: PayloadRequest }) => bootstrapFrogBot(args, attachFrogBot);
  const { afterError, afterLogout, afterMe } = existingHooks;

  out.hooks = {
    ...existingHooks,
    ...(orderFieldNames.length
      ? {
          beforeChange: [
            ...(existingHooks.beforeChange ?? []),
            buildBoardOrderHook(orderFieldNames),
          ],
        }
      : {}),
    beforeOperation: [setupFrogBot, ...(existingHooks.beforeOperation ?? [])],
    ...(afterMe?.length ? { afterMe: [setupFrogBot, ...afterMe] } : {}),
    ...(afterLogout?.length ? { afterLogout: [setupFrogBot, ...afterLogout] } : {}),
    ...(afterError?.length ? { afterError: [setupFrogBot, ...afterError] } : {}),
  };

  const searchEndpoints = search ? buildSearchEndpoints({ collection: c.slug }) : [];

  if (c.endpoints !== undefined || signIn.length || searchEndpoints.length) {
    out.endpoints = wrapEndpoints(
      signIn.length || searchEndpoints.length
        ? [
            ...(signIn.length
              ? buildSignInEndpoints({ collectionSlug: c.slug, methods: signIn })
              : []),
            ...(c.endpoints || []),
            ...searchEndpoints,
          ]
        : c.endpoints,
      attachFrogBot,
    );
  }

  return out;
}
