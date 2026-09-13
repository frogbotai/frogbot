import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import type { KV } from '../../kv/types.js';
import { pieceInstanceRuntime } from '../../pieces/definePiece.js';
import type { PieceInstance } from '../../pieces/types.js';
import type { FrogbotRequest } from '../../types/request.js';
import type { CredentialEncryption } from '../encryption.js';
import { OAuthError } from './error.js';

const lifetime = 600_000;
const randomValue = () => randomBytes(32).toString('base64url');
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const randomSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const stateSchema = z.object({
  state: randomSchema,
  flow: z.enum(['link', 'login']),
  piece: z.string().min(1),
  instance: z.string().min(1),
  clientId: z.string().min(1),
  collection: z.string().min(1),
  callbackUrl: z.string(),
  returnTo: z.string(),
  owner: z
    .object({
      id: z.union([z.string().refine((value) => value.trim().length > 0), z.number().int().safe()]),
      collection: z.string().min(1),
    })
    .optional(),
  browser: z.string().regex(/^[a-f0-9]{64}$/),
  verifier: randomSchema.optional(),
  issuedAt: z.number().finite(),
  expiresAt: z.number().finite(),
});

export type OAuthState = z.infer<typeof stateSchema>;
export type OAuthStateBinding = {
  flow: OAuthState['flow'];
  piece: PieceInstance;
  collection: string;
  callbackUrl: string;
};
export type OAuthStateStorage = {
  kv: Pick<KV, 'get' | 'setIfAbsent'>;
  encryption: CredentialEncryption;
};

function callbackURL(value: string): URL {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new OAuthError('configuration');
  }
  return url;
}

function safeReturnTo(value: string, callbackUrl: string): string {
  const base = callbackURL(callbackUrl);
  const url = new URL(value, base.origin);
  if (
    !value ||
    value !== value.trim() ||
    /[\\\p{Cc}]/u.test(value) ||
    url.origin !== base.origin ||
    url.pathname.startsWith('//') ||
    url.username ||
    url.password
  ) {
    throw new OAuthError('state');
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function cookieName(state: string, callbackUrl: string): string {
  return `${callbackURL(callbackUrl).protocol === 'https:' ? '__Host-' : ''}frogbot-oauth-${state}`;
}

function cookie(state: string, callbackUrl: string, value: string, maxAge: number): string {
  return `${cookieName(state, callbackUrl)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${callbackURL(callbackUrl).protocol === 'https:' ? '; Secure' : ''}`;
}

export async function createOAuthState({
  kv,
  encryption,
  piece,
  flow,
  collection,
  callbackUrl,
  returnTo,
  req,
}: OAuthStateStorage &
  OAuthStateBinding & {
    returnTo: string;
    req: Pick<FrogbotRequest, 'user'>;
  }): Promise<{ state: string; authorizationUrl: string; setCookie: string }> {
  const { definition } = pieceInstanceRuntime(piece);
  const recipe = definition.oauth;
  const app = piece.oauth;
  if (!recipe || !app) throw new OAuthError('configuration');

  const callback = callbackURL(callbackUrl).href;
  const state = randomValue();
  const browser = randomValue();
  const verifier = recipe.pkce ? randomValue() : undefined;
  const issuedAt = Date.now();
  const data = stateSchema.parse({
    state,
    flow,
    piece: piece.piece,
    instance: piece.slug,
    clientId: app.clientId,
    collection,
    callbackUrl: callback,
    returnTo: safeReturnTo(returnTo, callback),
    owner:
      flow === 'link' && req.user
        ? { id: req.user.id, collection: req.user.collection }
        : undefined,
    browser: digest(browser),
    verifier,
    issuedAt,
    expiresAt: issuedAt + lifetime,
  });

  if (flow === 'link' && (!data.owner || data.owner.collection !== collection)) {
    throw new OAuthError('state');
  }
  const url = callbackURL(recipe.authorizationUrl);
  const reserved = new Set([
    'state',
    'redirect_uri',
    'redirect',
    'code_challenge',
    'code_challenge_method',
    'code_verifier',
    'client_id',
    'response_type',
    'scope',
  ]);

  for (const key of reserved) url.searchParams.delete(key);
  for (const [key, value] of Object.entries(recipe.params ?? {})) {
    if (!reserved.has(key)) url.searchParams.set(key, value);
  }

  url.searchParams.set('client_id', app.clientId);
  url.searchParams.set('redirect_uri', callback);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  url.searchParams.set('scope', (app.scopes ?? recipe.scopes).join(' '));
  if (verifier) {
    url.searchParams.set(
      'code_challenge',
      createHash('sha256').update(verifier).digest('base64url'),
    );
    url.searchParams.set('code_challenge_method', 'S256');
  }

  const encrypted = await encryption.encrypt(JSON.stringify(data));
  if (!(await kv.setIfAbsent(`oauth:state:${state}`, encrypted, { ttl: lifetime }))) {
    throw new OAuthError('state');
  }

  return {
    state,
    authorizationUrl: url.href,
    setCookie: cookie(state, callback, browser, lifetime / 1000),
  };
}

export async function consumeOAuthState({
  kv,
  encryption,
  state,
  piece,
  flow,
  collection,
  callbackUrl,
  req,
}: OAuthStateStorage &
  OAuthStateBinding & {
    state: string;
    req: Pick<FrogbotRequest, 'headers' | 'user'>;
  }): Promise<{ intent: OAuthState; clearCookie: string }> {
  try {
    randomSchema.parse(state);
    const encrypted = await kv.get(`oauth:state:${state}`);
    if (typeof encrypted !== 'string') throw new OAuthError('state');
    const intent = stateSchema.parse(JSON.parse(await encryption.decrypt(encrypted)));
    const now = Date.now();

    if (
      intent.state !== state ||
      intent.flow !== flow ||
      intent.piece !== piece.piece ||
      intent.instance !== piece.slug ||
      intent.clientId !== piece.oauth?.clientId ||
      intent.collection !== collection ||
      intent.callbackUrl !== callbackURL(callbackUrl).href ||
      intent.returnTo !== safeReturnTo(intent.returnTo, intent.callbackUrl) ||
      intent.issuedAt > now ||
      intent.expiresAt <= now ||
      intent.expiresAt <= intent.issuedAt ||
      intent.expiresAt - intent.issuedAt > lifetime ||
      Boolean(intent.verifier) !== Boolean(pieceInstanceRuntime(piece).definition.oauth?.pkce) ||
      (flow === 'login' && intent.owner) ||
      (flow === 'link' && (!intent.owner || intent.owner.collection !== collection))
    ) {
      throw new OAuthError('state');
    }

    if (
      flow === 'link' &&
      req.user &&
      (req.user.collection !== intent.owner!.collection ||
        String(req.user.id) !== String(intent.owner!.id))
    ) {
      throw new OAuthError('state');
    }

    const name = cookieName(state, intent.callbackUrl);
    const values = (req.headers.get('cookie') ?? '')
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part.startsWith(`${name}=`));
    if (values.length !== 1) throw new OAuthError('state');

    const browser = randomSchema.parse(values[0]!.slice(name.length + 1));
    if (!timingSafeEqual(Buffer.from(intent.browser, 'hex'), Buffer.from(digest(browser), 'hex'))) {
      throw new OAuthError('state');
    }

    if (!(await kv.setIfAbsent(`oauth:consumed:${state}`, true, { ttl: lifetime }))) {
      throw new OAuthError('state');
    }

    if (intent.expiresAt <= Date.now()) throw new OAuthError('state');
    return { intent, clearCookie: cookie(state, intent.callbackUrl, '', 0) };
  } catch {
    throw new OAuthError('state');
  }
}
