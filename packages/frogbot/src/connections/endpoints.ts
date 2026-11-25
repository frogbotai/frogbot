import { continueLook, continuePage } from '../auth/signIn/continuePage.js';
import type { Endpoint } from '../endpoints/types.js';
import { frogbotError, type FrogBotErrorCode } from '../errors/catalog.js';
import { isFrogBotError, withHeaders } from '../errors/FrogBotError.js';
import { pieceInstanceDefinition } from '../pieces/definePiece.js';
import { isPieceSignIn } from '../pieces/oauth.js';
import type { PieceInstance } from '../pieces/types.js';
import type { FrogBotRequest } from '../types/request.js';
import {
  consumeOAuthState,
  createOAuthState,
  exchangeOAuthCode,
  isOAuthError,
} from './oauth/index.js';
import { saveOAuthConnection } from './oauth/save.js';
import { safeReturnTo } from './oauth/state.js';
import { connectionEntry } from './store.js';
import type { ConnectionHolder, SanitizedConnectionsConfig } from './types.js';

async function routeURLs({
  req,
  slug,
  piece,
}: {
  req: FrogBotRequest;
  slug: string;
  piece: string;
}) {
  const config = await req.frogbot.config._internal.payloadConfig;
  let server: URL;
  try {
    server = new URL(config.serverURL || new URL(req.url!).origin);
  } catch (cause) {
    throw frogbotError('oauth.configuration', { cause });
  }

  if (
    !['http:', 'https:'].includes(server.protocol) ||
    server.username ||
    server.password ||
    server.search ||
    server.hash
  ) {
    throw frogbotError('oauth.configuration');
  }

  const path = (prefix: string, suffix: string) => {
    if (prefix && (!prefix.startsWith('/') || /[\\\p{Cc}?#]/u.test(prefix))) {
      throw frogbotError('oauth.configuration');
    }

    const value = `${prefix.replace(/\/+$/, '')}/${suffix}`;
    if (value.startsWith('//')) throw frogbotError('oauth.configuration');

    return value;
  };

  return {
    callbackUrl: new URL(
      path(config.routes.api, `${encodeURIComponent(slug)}/${encodeURIComponent(piece)}/callback`),
      server.origin,
    ).href,
    returnTo: path(config.routes.admin, 'settings/connections'),
    cookiePrefix: config.cookiePrefix,
    config,
  };
}

export function buildConnectionOAuthEndpoints({
  connections,
  userSlug,
}: {
  connections: SanitizedConnectionsConfig;
  userSlug: string;
}): Endpoint[] {
  if (!connections.enabled) return [];
  const param = (req: FrogBotRequest, name: string) => {
    const value = req.routeParams?.[name];

    return typeof value === 'string' && value ? value : undefined;
  };

  const oauthEntry = (app: string | undefined, slug: string | undefined) => {
    const entry =
      slug === undefined ? undefined : connectionEntry(connections, { app, piece: slug });

    return entry?.oauth && entry.piece.piece === slug ? entry : undefined;
  };

  const notFound = (headers: Headers) => frogbotError('connection.not-found', { headers });

  const oauthFailure = ({
    req,
    error,
    piece,
    headers,
    provider,
  }: {
    req: FrogBotRequest;
    error: unknown;
    piece: PieceInstance;
    headers: Headers;
    provider?: string;
  }) => {
    req.frogbot.logger.warn(
      { err: error, piece: piece.piece },
      '[frogbot] Connection OAuth failed',
    );

    if (!isOAuthError(error)) {
      return isFrogBotError(error)
        ? withHeaders(error, headers)
        : frogbotError('connection.save-failed', {
            detail: "Couldn't link the account.",
            headers,
            cause: error,
          });
    }

    const { label } = pieceInstanceDefinition(piece);
    const data = provider && /^[a-z_]+$/.test(provider) ? { provider } : undefined;
    const details: Partial<Record<string, string>> = {
      'oauth.configuration': "This connection's OAuth setup is incomplete.",
      'oauth.tokens':
        data?.provider === 'access_denied'
          ? `The sign-in was cancelled or denied at ${label}.`
          : `Couldn't finish signing in to ${label}.`,
    };

    return frogbotError(error.code as FrogBotErrorCode, {
      detail: details[error.code] ?? error.message,
      ...(data ? { data } : {}),
      headers,
      cause: error,
    });
  };

  const authorize =
    (slot: boolean): Endpoint['handler'] =>
    async (req) => {
      const headers = new Headers({ 'cache-control': 'no-store' });
      const app = slot ? param(req, 'app') : undefined;
      const entry = slot && !app ? undefined : oauthEntry(app, param(req, 'piece'));
      if (!entry) throw notFound(headers);
      if (!req.user) throw frogbotError('auth.unauthenticated', { headers });
      if (req.user.collection !== userSlug) {
        throw frogbotError('auth.forbidden', { detail: 'Access denied.', headers });
      }

      try {
        const urls = await routeURLs({ req, slug: connections.slug!, piece: entry.piece.piece });
        const params = new URL(req.url!).searchParams;
        if (params.getAll('returnTo').length > 1) throw frogbotError('oauth.state');
        const returnTo = params.get('returnTo') ?? urls.returnTo;
        const recipe = pieceInstanceDefinition(entry.piece).oauth;
        if (params.getAll('reconnect').length > 1) throw frogbotError('oauth.state');
        if (app !== undefined && params.has('reconnect')) throw frogbotError('oauth.state');
        let reconnect: number | string | undefined;
        if (params.has('reconnect')) {
          const id = params.get('reconnect');
          const row = (await req.frogbot.connections.list({ req })).find(
            (row) => String(row.id) === id && row.piece === entry.piece.piece,
          );

          if (!row) throw notFound(headers);
          reconnect = row.id;
        }

        if (isPieceSignIn(recipe)) {
          const origin = new URL(req.url!).origin;
          const holder: ConnectionHolder =
            app === undefined
              ? { owner: { id: req.user.id, collection: req.user.collection } }
              : { app };

          const piece = entry.piece;
          const absolute = new URL(safeReturnTo(returnTo, origin), origin).href;
          let location: string;

          try {
            location = await recipe.authorize({
              req,
              returnTo: absolute,
              save: ({ tokens, account }) =>
                saveOAuthConnection({ req, piece, holder, tokens, account, reconnect }),
            });
          } catch (cause) {
            throw isOAuthError(cause) ? cause : frogbotError('oauth.configuration', { cause });
          }

          headers.set('location', location);

          return new Response(null, { status: 302, headers });
        }

        const started = await createOAuthState({
          kv: req.frogbot.kv,
          encryption: connections.encryption,
          piece: entry.piece,
          flow: 'link',
          app,
          collection: userSlug,
          callbackUrl: urls.callbackUrl,
          cookiePrefix: urls.cookiePrefix,
          returnTo,
          reconnect,
          req,
        });

        headers.set('set-cookie', started.setCookie);
        headers.set('location', started.authorizationUrl);

        return new Response(null, { status: 302, headers });
      } catch (error) {
        throw oauthFailure({ req, error, piece: entry.piece, headers });
      }
    };

  return [
    { method: 'get', path: '/:piece/authorize', handler: authorize(false) },
    {
      method: 'get',
      path: '/:piece/callback',
      handler: async (req) => {
        const headers = new Headers({ 'cache-control': 'no-store' });
        const slug = param(req, 'piece');
        const candidates = [undefined, ...Object.keys(connections.apps)].flatMap((app) => {
          const entry = oauthEntry(app, slug);

          return entry && !isPieceSignIn(pieceInstanceDefinition(entry.piece).oauth)
            ? [{ app, entry }]
            : [];
        });

        if (!candidates.length) throw notFound(headers);

        const params = new URL(req.url!).searchParams;
        let piece = candidates[0].entry.piece;

        try {
          const { callbackUrl, cookiePrefix, config } = await routeURLs({
            req,
            slug: connections.slug!,
            piece: slug!,
          });

          if (params.getAll('state').length !== 1) throw frogbotError('oauth.state');

          let consumed;

          for (const { app, entry } of candidates) {
            try {
              consumed = {
                app,
                entry,
                ...(await consumeOAuthState({
                  kv: req.frogbot.kv,
                  encryption: connections.encryption,
                  state: params.get('state')!,
                  piece: entry.piece,
                  flow: 'link',
                  app,
                  collection: userSlug,
                  callbackUrl,
                  cookiePrefix,
                  req,
                })),
              };

              break;
            } catch (error) {
              if (!isOAuthError(error)) throw error;
            }
          }

          if (!consumed) throw frogbotError('oauth.state');
          const { app, entry, intent, clearCookie } = consumed;
          piece = entry.piece;

          headers.set('set-cookie', clearCookie);

          if (params.has('error') || params.getAll('code').length !== 1) {
            throw frogbotError('oauth.tokens');
          }

          const owner = intent.owner!;
          const user = await req.frogbot.findByID({
            collection: owner.collection,
            id: owner.id,
            depth: 0,
            overrideAccess: true,
            disableErrors: true,
          });

          if (!user) throw frogbotError('oauth.state');

          const tokens = await exchangeOAuthCode({
            piece: entry.piece,
            code: params.get('code')!,
            callbackUrl,
            verifier: intent.verifier,
            signal: req.signal,
          });

          await saveOAuthConnection({
            req,
            piece: entry.piece,
            holder: app === undefined ? { owner } : { app },
            tokens,
            reconnect: intent.reconnect,
          });

          return continuePage({
            returnTo: intent.returnTo,
            look: continueLook({
              config,
              collectionSlug: owner.collection,
              returnTo: intent.returnTo,
              headers: req.headers,
            }),
            lang: req.i18n.language,
            t: req.t,
            headers,
          });
        } catch (error) {
          throw oauthFailure({
            req,
            error,
            piece,
            headers,
            provider: params.get('error') ?? undefined,
          });
        }
      },
    },
    { method: 'get', path: '/app/:app/:piece/authorize', handler: authorize(true) },
  ];
}
