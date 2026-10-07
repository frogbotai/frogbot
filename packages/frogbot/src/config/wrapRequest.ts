import type {
  AuthStrategy as PayloadAuthStrategy,
  AuthStrategyResult as PayloadAuthStrategyResult,
  CollectionConfig as PayloadCollectionConfig,
  Config as PayloadConfig,
  Endpoint as PayloadEndpoint,
  LivePreviewConfig as PayloadLivePreviewConfig,
  Payload,
  PayloadHandler,
  PayloadRequest,
  UploadConfig as PayloadUploadConfig,
} from 'payload';

import { executeAuthStrategy } from '../auth/executeAuthStrategy.js';
import { unwrapSessionPayload } from '../auth/operation.js';
import type { AuthEmail, AuthStrategy } from '../auth/types.js';
import type { CollectionAdminConfig } from '../collections/config/types.js';
import type { Endpoint, Handler } from '../endpoints/types.js';
import type { FrogBot } from '../frogbot.js';
import { seedFrogBotCache } from '../getFrogBot.js';
import type { FrogBotRequest } from '../types/request.js';
import type { UploadHandler } from '../uploads/types.js';
import { attachFrogBotInstance, attachRegisteredFrogBot } from './attachFrogBot.js';
import type { FrogBotConfig, GeneratePreviewURL, LivePreviewConfig } from './types.js';

export type AttachFrogBot = (req: PayloadRequest) => Promise<FrogBotRequest>;

export type ResolveFrogBot = (payload: Payload) => Promise<FrogBot>;

export function wrapAuthStrategies({
  collection,
  strategies,
  resolveFrogBot,
}: {
  collection: string;
  strategies: AuthStrategy[];
  resolveFrogBot: ResolveFrogBot;
}): PayloadAuthStrategy[] {
  return strategies.map((strategy) => ({
    name: strategy.name,
    authenticate: async ({ payload, canSetHeaders, headers, isGraphQL, req, strategyName }) => {
      const frogbot = await resolveFrogBot(unwrapSessionPayload(payload));

      seedFrogBotCache(frogbot, frogbot.config);

      const frogbotReq = req ? attachFrogBotInstance(req, frogbot) : undefined;

      return executeAuthStrategy({
        collection,
        strategy,
        canSetHeaders,
        frogbot,
        headers,
        isGraphQL,
        req: frogbotReq,
        strategyName,
      }) as Promise<PayloadAuthStrategyResult>;
    },
  }));
}

export async function bootstrapFrogBot(
  args: { req: PayloadRequest },
  attachFrogBot: AttachFrogBot,
): Promise<void> {
  if (!args.req.payload) return;

  await attachFrogBot(args.req);
}

function wrapEndpointHandler(handler: Handler, attachFrogBot: AttachFrogBot): PayloadHandler {
  return async (req) => handler(await attachFrogBot(req));
}

export function wrapRootHooks(
  hooks: FrogBotConfig['hooks'],
  attachFrogBot: AttachFrogBot,
): PayloadConfig['hooks'] {
  if (!hooks?.afterError) return hooks as PayloadConfig['hooks'];

  return {
    afterError: hooks.afterError.map(
      (hook) => async (args) => hook({ ...args, req: await attachFrogBot(args.req) }),
    ),
  };
}

export function wrapLivePreview(
  livePreview: LivePreviewConfig | undefined,
  attachFrogBot: AttachFrogBot,
): PayloadLivePreviewConfig | undefined {
  if (!livePreview || typeof livePreview.url !== 'function') {
    return livePreview as PayloadLivePreviewConfig | undefined;
  }

  const { url } = livePreview;

  return {
    ...livePreview,
    url: async ({ collectionConfig, data, locale, req }) =>
      url({ collectionConfig, data, locale, req: await attachFrogBot(req) }),
  };
}

type PayloadPreview = NonNullable<NonNullable<PayloadCollectionConfig['admin']>['preview']>;

export function wrapPreview(
  preview: GeneratePreviewURL,
  attachFrogBot: AttachFrogBot,
): PayloadPreview {
  return async (doc, options) =>
    preview(doc, { ...options, req: await attachFrogBot(options.req) });
}

type PayloadFormatDocURL = NonNullable<
  NonNullable<PayloadCollectionConfig['admin']>['formatDocURL']
>;

export function wrapFormatDocURL(
  formatDocURL: NonNullable<CollectionAdminConfig['formatDocURL']>,
): PayloadFormatDocURL {
  return (args) => formatDocURL({ ...args, req: attachRegisteredFrogBot(args.req) });
}

type PayloadUploadHandler = NonNullable<PayloadUploadConfig['handlers']>[number];

export function wrapUploadHandlers(
  handlers: UploadHandler[],
  attachFrogBot: AttachFrogBot,
): PayloadUploadHandler[] {
  return handlers.map(
    (handler) =>
      (async (req, args) => handler(await attachFrogBot(req), args)) as PayloadUploadHandler,
  );
}

type AuthEmailTemplate = NonNullable<AuthEmail['generateEmailHTML']>;

type PayloadAuthEmailTemplate = (args?: {
  req?: PayloadRequest;
  token?: string;
  user?: unknown;
}) => Promise<string>;

function wrapAuthEmailTemplate(
  template: AuthEmailTemplate,
  attachFrogBot: AttachFrogBot,
): PayloadAuthEmailTemplate {
  return async (args) => {
    if (!args?.req || args.token === undefined) {
      throw new Error('[frogbot] Auth email templates are called with the request and token.');
    }

    return template({ req: await attachFrogBot(args.req), token: args.token, user: args.user });
  };
}

export function wrapAuthEmail<TEmail extends AuthEmail>(
  email: TEmail,
  attachFrogBot: AttachFrogBot,
): Omit<TEmail, keyof AuthEmail> & {
  generateEmailHTML?: PayloadAuthEmailTemplate;
  generateEmailSubject?: PayloadAuthEmailTemplate;
} {
  const { generateEmailHTML, generateEmailSubject, ...rest } = email;

  return {
    ...rest,
    ...(generateEmailHTML
      ? { generateEmailHTML: wrapAuthEmailTemplate(generateEmailHTML, attachFrogBot) }
      : {}),
    ...(generateEmailSubject
      ? { generateEmailSubject: wrapAuthEmailTemplate(generateEmailSubject, attachFrogBot) }
      : {}),
  };
}

export function wrapLocalization(
  localization: FrogBotConfig['localization'],
  attachFrogBot: AttachFrogBot,
): PayloadConfig['localization'] {
  if (!localization || typeof localization.filterAvailableLocales !== 'function') {
    return localization as PayloadConfig['localization'];
  }

  const { filterAvailableLocales } = localization;

  return {
    ...localization,
    filterAvailableLocales: async (args) =>
      filterAvailableLocales({ ...args, req: await attachFrogBot(args.req) }),
  };
}

export function wrapEndpoints(
  endpoints: Endpoint[] | false | undefined,
  attachFrogBot: AttachFrogBot,
): PayloadEndpoint[] | false | undefined {
  if (!endpoints) return endpoints;

  return wrapEndpointList(endpoints, attachFrogBot);
}

export function wrapEndpointList(
  endpoints: Endpoint[],
  attachFrogBot: AttachFrogBot,
): PayloadEndpoint[] {
  return endpoints.map((e) => ({
    ...e,
    handler: wrapEndpointHandler(e.handler, attachFrogBot),
  }));
}
