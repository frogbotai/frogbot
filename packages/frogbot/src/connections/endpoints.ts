import type { Endpoint } from '../endpoints/types.js';
import { pieceInstanceDefinition } from '../pieces/definePiece.js';
import type { FrogBotRequest } from '../types/request.js';
import {
  consumeOAuthState,
  createOAuthState,
  exchangeOAuthCode,
  lookupOAuthAccount,
  OAuthError,
  oauthTokenMetadata,
} from './oauth/index.js';
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
          const started = await createOAuthState({
            kv: req.frogbot.kv,
            encryption: connections.encryption,
            piece: entry.piece,
            flow: 'link',
            collection: userSlug,
            callbackUrl: urls.callbackUrl,
            returnTo: params.get('returnTo') ?? urls.returnTo,
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
        if (!entry) return failure(404, headers, 'Connection not found');

        try {
          const { callbackUrl } = await routeURLs({
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

          const metadata = oauthTokenMetadata({
            tokens,
            scopes: entry.piece.oauth?.scopes ?? pieceInstanceDefinition(entry.piece).oauth!.scopes,
          });

          const account = await lookupOAuthAccount({
            piece: entry.piece,
            tokens,
            req,
            signal: req.signal,
          });

          await (
            await req.frogbot.connections.store
          ).upsert({
            owner,
            piece: entry.piece.piece,
            method: 'oauth',
            credential: tokens,
            account,
            ...metadata,
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
