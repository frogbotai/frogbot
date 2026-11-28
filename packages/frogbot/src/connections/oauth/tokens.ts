import { z } from 'zod';

import { frogbotError } from '../../errors/catalog.js';
import { pieceInstanceRuntime } from '../../pieces/definePiece.js';
import { urlRecipe } from '../../pieces/oauth.js';
import type { OAuthTokens, PieceInstance, PieceOAuthAccount } from '../../pieces/types.js';
import type { FrogBotRequest } from '../../types/request.js';
import { oauthEndpoints } from './discovery.js';

const tokenSchema = z
  .object({
    access_token: z.string().refine((value) => value.trim().length > 0),
    refresh_token: z.string().min(1).optional(),
    token_type: z.string().min(1).optional(),
    scope: z.string().optional(),
    expires_in: z
      .union([
        z.number(),
        z
          .string()
          .regex(/^\d+(\.\d+)?$/)
          .transform(Number),
      ])
      .pipe(z.number().finite().nonnegative())
      .optional(),
  })
  .catchall(z.json());

export function parseOAuthTokens(value: unknown): OAuthTokens {
  try {
    const tokens = tokenSchema.parse(value);
    if (Object.hasOwn(tokens, 'error') || Object.hasOwn(tokens, 'error_description')) {
      throw frogbotError('oauth.tokens');
    }

    oauthTokenMetadata({ tokens });

    return tokens;
  } catch {
    throw frogbotError('oauth.tokens');
  }
}

export function oauthTokenMetadata({
  tokens,
  scopes = [],
  lifetime,
}: {
  tokens: OAuthTokens;
  scopes?: readonly string[];
  /** Seconds the token lives when `expires_in` is missing: the recipe's `tokenLifetime`. */
  lifetime?: number;
}): { scopes: string[]; expiresAt: string | null } {
  const seconds = tokens.expires_in ?? lifetime;
  const expiry = seconds === undefined ? undefined : Date.now() + seconds * 1000;

  if (
    expiry !== undefined &&
    (!Number.isFinite(expiry) || !Number.isFinite(new Date(expiry).getTime()))
  ) {
    throw frogbotError('oauth.tokens');
  }

  return {
    scopes: [
      ...new Set(
        tokens.scope === undefined ? scopes : tokens.scope.split(/[\s,]+/).filter(Boolean),
      ),
    ],
    expiresAt: expiry === undefined ? null : new Date(expiry).toISOString(),
  };
}

function callbackRequest({
  req,
  signal,
}: {
  req: FrogBotRequest;
  signal: AbortSignal;
}): FrogBotRequest {
  return new Proxy(req, {
    get(target, property) {
      if (property === 'signal') return signal;
      const value = Reflect.get(target, property, target);

      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

async function timed<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ...signals: (AbortSignal | undefined)[]
): Promise<T> {
  const controller = new AbortController();
  const combined = AbortSignal.any([
    controller.signal,
    ...signals.filter((signal): signal is AbortSignal => signal !== undefined),
  ]);

  let abort!: () => void;
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    combined.throwIfAborted();

    return await Promise.race([
      new Promise<never>((_, reject) => {
        abort = () => reject(frogbotError('oauth.tokens'));
        combined.addEventListener('abort', abort, { once: true });
      }),
      fn(combined),
    ]);
  } finally {
    clearTimeout(timeout);
    if (abort) combined.removeEventListener('abort', abort);
  }
}

async function requestTokens({
  piece,
  params,
  signal,
}: {
  piece: PieceInstance;
  params: Record<string, string>;
  signal?: AbortSignal;
}): Promise<OAuthTokens> {
  const recipe = urlRecipe(pieceInstanceRuntime(piece).definition);
  const app = piece.oauth;
  if (!recipe || !app) throw frogbotError('oauth.configuration');

  const headers = new Headers({
    'content-type': 'application/x-www-form-urlencoded',
    accept: 'application/json',
  });

  const body = new URLSearchParams(params);

  if (recipe.tokenEndpointAuthMethod === 'client_secret_basic') {
    const clientId = new URLSearchParams({ value: app.clientId }).toString().slice('value='.length);
    const clientSecret = new URLSearchParams({ value: app.clientSecret })
      .toString()
      .slice('value='.length);

    headers.set(
      'authorization',
      `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    );
  } else {
    body.set('client_id', app.clientId);
    body.set('client_secret', app.clientSecret);
  }

  try {
    return await timed(async (signal) => {
      const response = await fetch((await oauthEndpoints(recipe)).tokenUrl, {
        method: 'POST',
        headers,
        body,
        redirect: 'error',
        signal,
      });

      if (!response.ok) {
        throw frogbotError('oauth.tokens', {
          detail: `The token endpoint answered ${response.status}.`,
        });
      }

      return parseOAuthTokens(await response.json());
    }, signal);
  } catch (cause) {
    throw frogbotError('oauth.tokens', { cause });
  }
}

export async function exchangeOAuthCode({
  piece,
  code,
  callbackUrl,
  verifier,
  signal,
}: {
  piece: PieceInstance;
  code: string;
  callbackUrl: string;
  verifier?: string;
  signal?: AbortSignal;
}): Promise<OAuthTokens> {
  if (
    !code.trim() ||
    (verifier !== undefined && !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) ||
    (urlRecipe(pieceInstanceRuntime(piece).definition)?.pkce && !verifier)
  ) {
    throw frogbotError('oauth.tokens');
  }

  return requestTokens({
    piece,
    signal,
    params: {
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUrl,
      ...(verifier ? { code_verifier: verifier } : {}),
    },
  });
}

export function oauthAuth({
  piece,
  tokens,
}: {
  piece: PieceInstance;
  tokens: OAuthTokens;
}): unknown {
  const { definition } = pieceInstanceRuntime(piece);
  if (!definition.oauth || !definition.auth) throw frogbotError('oauth.configuration');
  const schema = definition.oauth.auth ?? definition.auth;

  try {
    return schema.parse(
      definition.oauth.toAuth
        ? definition.oauth.toAuth({ tokens })
        : { accessToken: tokens.access_token },
    );
  } catch {
    throw frogbotError('oauth.tokens');
  }
}

const accountSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  email: z.string().trim().toLowerCase().pipe(z.email()).optional(),
});

/** Checks an account a recipe returned: a non-empty `id` and `label`, and a valid `email`. */
export function parseOAuthAccount(account: unknown): PieceOAuthAccount {
  return accountSchema.parse(account);
}

export async function lookupOAuthAccount({
  piece,
  tokens,
  req,
  signal,
}: {
  piece: PieceInstance;
  tokens: OAuthTokens;
  req: FrogBotRequest;
  signal?: AbortSignal;
}): Promise<PieceOAuthAccount | undefined> {
  const { definition, options } = pieceInstanceRuntime(piece);
  const validatedTokens = parseOAuthTokens(tokens);
  const auth = oauthAuth({ piece, tokens: validatedTokens });
  const account = urlRecipe(definition)?.account;
  if (!account) return;
  if (!definition.auth) throw frogbotError('oauth.configuration');

  try {
    return await timed(
      async (signal) => {
        const client = await definition.client({ auth, options });
        signal.throwIfAborted();

        return parseOAuthAccount(
          await account({ tokens: validatedTokens, client, req: callbackRequest({ req, signal }) }),
        );
      },
      signal,
      req.signal,
    );
  } catch (cause) {
    throw frogbotError('oauth.account', {
      cause,
      detail: `Couldn't read the signed-in account from ${definition.label}.`,
    });
  }
}

export async function refreshOAuthTokens({
  piece,
  tokens,
  req,
  signal,
}: {
  piece: PieceInstance;
  tokens: OAuthTokens;
  req: FrogBotRequest;
  signal?: AbortSignal;
}): Promise<OAuthTokens> {
  const recipe = pieceInstanceRuntime(piece).definition.oauth;
  if (!recipe) throw frogbotError('oauth.configuration');

  let next: OAuthTokens;
  if (recipe.refresh) {
    next = parseOAuthTokens(
      await timed(
        (signal) => recipe.refresh!({ tokens, req: callbackRequest({ req, signal }) }),
        signal,
        req.signal,
      ),
    );
  } else {
    if (!tokens.refresh_token) {
      throw frogbotError('oauth.refresh', { detail: 'No refresh token is stored.' });
    }

    next = await requestTokens({
      piece,
      signal: signal && req.signal ? AbortSignal.any([signal, req.signal]) : (signal ?? req.signal),
      params: {
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
      },
    });
  }

  const merged = {
    ...tokens,
    ...Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined)),
  };

  if (next.expires_in === undefined) delete merged.expires_in;

  return parseOAuthTokens(merged);
}
