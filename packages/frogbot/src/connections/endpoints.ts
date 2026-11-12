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
import type { SanitizedConnectionsConfig } from './types.js';

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
  const entryFor = (req: FrogBotRequest) => {
    const slug = req.routeParams?.piece;
    const entry =
      connections.enabled && typeof slug === 'string' && Object.hasOwn(connections.entries, slug)
        ? connections.entries[slug]
        : undefined;

    return entry?.oauth && entry.piece.piece === slug ? entry : undefined;
  };

  const failure = (status: number, headers: Headers, error = 'Connection operation failed') =>
    Response.json({ error }, { status, headers });

  return [
    {
      method: 'get',
      path: '/:piece/authorize',
      handler: async (req) => {
        const headers = new Headers({ 'cache-control': 'no-store' });
        const entry = entryFor(req);
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
            const owner = { id: req.user.id, collection: req.user.collection };
            const piece = entry.piece;

            headers.set(
              'location',
              await recipe.authorize({
                req,
                returnTo: new URL(safeReturnTo(returnTo, origin), origin).href,
                save: ({ tokens, account }) =>
                  saveOAuthConnection({ req, piece, owner, tokens, account, reconnect }),
              }),
            );

            return new Response(null, { status: 302, headers });
          }

          const started = await createOAuthState({
            kv: req.frogbot.kv,
            encryption: connections.encryption,
            piece: entry.piece,
            flow: 'link',
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
          return failure(
            error instanceof OAuthError && error.code === 'state' ? 400 : 500,
            headers,
          );
        }
      },
    },
    {
      method: 'get',
      path: '/:piece/callback',
      handler: async (req) => {
        const headers = new Headers({ 'cache-control': 'no-store' });
        const entry = entryFor(req);
        if (!entry || isPieceSignIn(pieceInstanceDefinition(entry.piece).oauth)) {
          return failure(404, headers, 'Connection not found');
        }

        try {
          const { callbackUrl, cookiePrefix } = await routeURLs({
            req,
            slug: connections.slug!,
            piece: entry.piece.piece,
          });

          const params = new URL(req.url!).searchParams;
          if (params.getAll('state').length !== 1) throw new OAuthError('state');

          const { intent, clearCookie } = await consumeOAuthState({
            kv: req.frogbot.kv,
            encryption: connections.encryption,
            state: params.get('state')!,
            piece: entry.piece,
            flow: 'link',
            collection: userSlug,
            callbackUrl,
            cookiePrefix,
            req,
          });

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
            owner,
            tokens,
            reconnect: intent.reconnect,
          });

          headers.set('location', intent.returnTo);

          return new Response(null, { status: 302, headers });
        } catch (error) {
          return failure(error instanceof OAuthError ? 400 : 500, headers);
        }
      },
    },
  ];
}
