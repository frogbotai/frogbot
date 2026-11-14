import { continueLook, continuePage } from '../auth/signIn/continuePage.js';
import type { Endpoint } from '../endpoints/types.js';
import { pieceInstanceDefinition } from '../pieces/definePiece.js';
import { isPieceSignIn } from '../pieces/oauth.js';
import type { FrogBotRequest } from '../types/request.js';
import {
  consumeOAuthState,
  createOAuthState,
  exchangeOAuthCode,
  OAuthError,
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
  const server = new URL(config.serverURL || new URL(req.url!).origin);
  if (
    !['http:', 'https:'].includes(server.protocol) ||
    server.username ||
    server.password ||
    server.search ||
    server.hash
  ) {
    throw new OAuthError('configuration');
  }

  const path = (prefix: string, suffix: string) => {
    if (prefix && (!prefix.startsWith('/') || /[\\\p{Cc}?#]/u.test(prefix))) {
      throw new OAuthError('configuration');
    }

    const value = `${prefix.replace(/\/+$/, '')}/${suffix}`;
    if (value.startsWith('//')) throw new OAuthError('configuration');

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

  const failure = (status: number, headers: Headers, error = 'Connection operation failed') =>
    Response.json({ error }, { status, headers });

  const authorize =
    (slot: boolean): Endpoint['handler'] =>
    async (req) => {
      const headers = new Headers({ 'cache-control': 'no-store' });
      const app = slot ? param(req, 'app') : undefined;
      const entry = slot && !app ? undefined : oauthEntry(app, param(req, 'piece'));
      if (!entry) return failure(404, headers, 'Connection not found');
      if (!req.user) return failure(401, headers, 'Authentication required');
      if (req.user.collection !== userSlug) return failure(403, headers, 'Access denied');
      try {
        const urls = await routeURLs({ req, slug: connections.slug!, piece: entry.piece.piece });
        const params = new URL(req.url!).searchParams;
        if (params.getAll('returnTo').length > 1) throw new OAuthError('state');
        const returnTo = params.get('returnTo') ?? urls.returnTo;
        const recipe = pieceInstanceDefinition(entry.piece).oauth;
        if (params.getAll('reconnect').length > 1) throw new OAuthError('state');
        if (app !== undefined && params.has('reconnect')) throw new OAuthError('state');
        let reconnect: number | string | undefined;
        if (params.has('reconnect')) {
          const id = params.get('reconnect');
          const row = (await req.frogbot.connections.list({ req })).find(
            (row) => String(row.id) === id && row.piece === entry.piece.piece,
          );

          if (!row) return failure(404, headers, 'Connection not found');
          reconnect = row.id;
        }

        if (isPieceSignIn(recipe)) {
          const origin = new URL(req.url!).origin;
          const holder: ConnectionHolder =
            app === undefined
              ? { owner: { id: req.user.id, collection: req.user.collection } }
              : { app };

          const piece = entry.piece;

          headers.set(
            'location',
            await recipe.authorize({
              req,
              returnTo: new URL(safeReturnTo(returnTo, origin), origin).href,
              save: ({ tokens, account }) =>
                saveOAuthConnection({ req, piece, holder, tokens, account, reconnect }),
            }),
          );

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
        return failure(error instanceof OAuthError && error.code === 'state' ? 400 : 500, headers);
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

        if (!candidates.length) return failure(404, headers, 'Connection not found');

        try {
          const { callbackUrl, cookiePrefix, config } = await routeURLs({
            req,
            slug: connections.slug!,
            piece: slug!,
          });

          const params = new URL(req.url!).searchParams;
          if (params.getAll('state').length !== 1) throw new OAuthError('state');

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
              if (!(error instanceof OAuthError)) throw error;
            }
          }

          if (!consumed) throw new OAuthError('state');
          const { app, entry, intent, clearCookie } = consumed;

          headers.set('set-cookie', clearCookie);

          if (params.has('error') || params.getAll('code').length !== 1) {
            throw new OAuthError('tokens');
          }

          const owner = intent.owner!;
          const user = await req.frogbot.findByID({
            collection: owner.collection,
            id: owner.id,
            depth: 0,
            overrideAccess: true,
            disableErrors: true,
          });

          if (!user) throw new OAuthError('state');

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
          return failure(error instanceof OAuthError ? 400 : 500, headers);
        }
      },
    },
    { method: 'get', path: '/app/:app/:piece/authorize', handler: authorize(true) },
  ];
}
