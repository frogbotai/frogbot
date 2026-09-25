import { generatePayloadCookie } from 'payload/shared';

import {
  consumeOAuthState,
  createOAuthState,
  exchangeOAuthCode,
  lookupOAuthAccount,
  OAuthError,
} from '../../connections/oauth/index.js';
import type { Endpoint } from '../../endpoints/types.js';
import type { SignInMethod } from '../../pieces/types.js';
import type { FrogBotRequest } from '../../types/request.js';
import { issueSession } from '../session.js';
import { resolveSignInIdentity } from './identity.js';

async function routeURLs({
  req,
  collectionSlug,
  method,
}: {
  req: FrogBotRequest;
  collectionSlug: string;
  method: SignInMethod;
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
  const prefix = config.routes.api.replace(/\/+$/, '');
  if (
    (prefix && !prefix.startsWith('/')) ||
    prefix.startsWith('//') ||
    /[\\\p{Cc}?#]/u.test(prefix)
  ) {
    throw new OAuthError('configuration');
  }
  return {
    callbackUrl: new URL(
      `${prefix}/${encodeURIComponent(collectionSlug)}/sign-in/${encodeURIComponent(method.slug)}/callback`,
      server.origin,
    ).href,
    returnTo: collectionSlug === config.admin.user ? config.routes.admin : '/',
  };
}

export function buildSignInEndpoints({
  collectionSlug,
  methods,
}: {
  collectionSlug: string;
  methods: SignInMethod[];
}): Endpoint[] {
  if (!methods.length) return [];
  const methodFor = (req: FrogBotRequest) =>
    methods.find(({ slug }) => slug === req.routeParams?.piece);
  const failure = (status: number, headers: Headers) =>
    Response.json(
      { error: status === 404 ? 'Sign-in method not found' : 'Sign-in failed' },
      { status, headers },
    );
  return [
    {
      method: 'get',
      path: '/sign-in/:piece',
      handler: async (req) => {
        const headers = new Headers({ 'cache-control': 'no-store' });
        const method = methodFor(req);
        if (!method) return failure(404, headers);
        try {
          const urls = await routeURLs({ req, collectionSlug, method });
          const params = new URL(req.url!).searchParams;
          if (params.getAll('returnTo').length > 1) throw new OAuthError('state');
          const started = await createOAuthState({
            kv: req.frogbot.kv,
            encryption: req.frogbot.config.connections.encryption,
            piece: method,
            flow: 'login',
            collection: collectionSlug,
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
      path: '/sign-in/:piece/callback',
      handler: async (req) => {
        const headers = new Headers({ 'cache-control': 'no-store' });
        const method = methodFor(req);
        if (!method) return failure(404, headers);

        try {
          const { callbackUrl } = await routeURLs({ req, collectionSlug, method });
          const params = new URL(req.url!).searchParams;
          if (params.getAll('state').length !== 1) throw new OAuthError('state');

          const { intent, clearCookie } = await consumeOAuthState({
            kv: req.frogbot.kv,
            encryption: req.frogbot.config.connections.encryption,
            state: params.get('state')!,
            piece: method,
            flow: 'login',
            collection: collectionSlug,
            callbackUrl,
            req,
          });
          headers.set('set-cookie', clearCookie);

          if (params.has('error') || params.getAll('code').length !== 1) {
            throw new OAuthError('tokens');
          }

          const tokens = await exchangeOAuthCode({
            piece: method,
            code: params.get('code')!,
            callbackUrl,
            verifier: intent.verifier,
            signal: req.signal,
          });

          const account = await lookupOAuthAccount({
            piece: method,
            tokens,
            req,
            signal: req.signal,
          });

          const userId = await resolveSignInIdentity({
            req,
            collectionSlug,
            email: account?.email,
          });

          const { token } = await issueSession({ req, collectionSlug, userId });
          const config = await req.frogbot.config._internal.payloadConfig;
          const collection = config.collections.find(({ slug }) => slug === collectionSlug)!;

          headers.append(
            'set-cookie',
            generatePayloadCookie({
              collectionAuthConfig: collection.auth,
              cookiePrefix: config.cookiePrefix,
              token,
            }),
          );

          headers.set('location', intent.returnTo);
          return new Response(null, { status: 302, headers });
        } catch (error) {
          return failure(error instanceof OAuthError ? 400 : 500, headers);
        }
      },
    },
  ];
}
