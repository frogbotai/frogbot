import {
  addDataAndFileToRequest,
  type CollectionBeforeLoginHook,
  type CollectionBeforeSignInHook,
  type Endpoint,
  type FrogBotRequest,
  headersWithCors,
} from 'frogbot';
import { APIError, loginOperation, resetPasswordOperation } from 'payload';
import { generatePayloadCookie } from 'payload/shared';

import {
  hasTwoFactor,
  jsonError,
  noStore,
  payloadRequest,
  readUser,
  routes,
  safeReturnTo,
  type TwoFactorContext,
  type TwoFactorUser,
  writeUser,
} from './context.js';
import { createPending } from './pending.js';
import { createTOTPSecret } from './totp.js';

/** Thrown by the plugin's `beforeLogin` gate for a user who must enter a code or set up two-factor sign-in first. */
export class TwoFactorRequired extends APIError {
  readonly userId: string | number;
  readonly mode: 'code' | 'setup';

  constructor(userId: string | number, mode: 'code' | 'setup') {
    super('Two-factor sign-in is required. Sign in through the two-factor flow.', 403);
    this.userId = userId;
    this.mode = mode;
  }
}

/** `'code'` for a user with two-factor sign-in on, `'setup'` for one `require` covers who has none, otherwise `null`. */
export async function twoFactorStep(
  req: FrogBotRequest,
  ctx: TwoFactorContext,
  user: TwoFactorUser,
): Promise<'code' | 'setup' | null> {
  if (hasTwoFactor(user)) return 'code';

  return (await ctx.options.require({ req, user })) ? 'setup' : null;
}

export async function startPending({
  req,
  ctx,
  userId,
  method,
  mode,
  returnTo,
}: {
  req: FrogBotRequest;
  ctx: TwoFactorContext;
  userId: string | number;
  method: string;
  mode: 'code' | 'setup';
  returnTo?: string;
}): Promise<string> {
  const secret =
    mode === 'setup'
      ? await req.frogbot.config.connections.encryption.encrypt(createTOTPSecret())
      : undefined;

  return createPending({
    req,
    slug: ctx.slug,
    pending: {
      userId,
      method,
      mode,
      response: returnTo === undefined ? 'json' : 'page',
      returnTo,
      secret,
    },
  });
}

/** Pauses a provider sign-in for a code or setup and redirects to the two-factor page. */
export const createBeforeSignIn =
  (ctx: TwoFactorContext): CollectionBeforeSignInHook =>
  async ({ req, user, method, returnTo }) => {
    const mode = await twoFactorStep(req, ctx, user as TwoFactorUser);
    if (!mode) return;

    const cookie = await startPending({ req, ctx, userId: user.id, method, mode, returnTo });

    return new Response(null, {
      status: 303,
      headers: noStore({ location: routes(req, ctx.slug).base, 'set-cookie': cookie }),
    });
  };

/**
 * Refuses a login that would skip the code: password login through any path other than the
 * plugin's `/login`, which turns the refusal into a pending sign-in. A sign-in resumed through
 * `finishSignIn` and the plugin's own reset-password and first-register pass.
 */
export const createBeforeLogin =
  (ctx: TwoFactorContext): CollectionBeforeLoginHook =>
  async ({ req, user }) => {
    if (req.context.signIn || req.context.twoFactorReset || req.context.twoFactorFirstUser) return;

    const mode = await twoFactorStep(req, ctx, user as TwoFactorUser);
    if (mode) throw new TwoFactorRequired(user.id as string | number, mode);
  };

export const depthOf = (req: FrogBotRequest) => {
  const depth = req.searchParams.get('depth');

  return depth !== null && !Number.isNaN(parseFloat(depth)) ? Number(depth) : undefined;
};

export const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** The `202` answer that sends a password sign-in to the code or setup page, with the pending cookie and no token. */
export function pendingResponse({
  req,
  mode,
  url,
  cookie,
}: {
  req: FrogBotRequest;
  mode: 'code' | 'setup';
  url: string;
  cookie: string;
}): Response {
  return Response.json(
    {
      message:
        mode === 'code'
          ? 'Enter the code from your authenticator app.'
          : 'Set up two-factor sign-in to continue.',
      twoFactor: mode,
      url,
    },
    {
      status: 202,
      headers: headersWithCors({ headers: noStore({ 'set-cookie': cookie }), req }),
    },
  );
}

/**
 * `POST /login`, Payload's handler plus the code step: a user who needs a code or setup gets
 * `202 { message, twoFactor, url }` and the pending cookie, with no token and no session. A body
 * `returnTo` makes the code page continue there; without it the code step answers in JSON.
 */
export const createLoginEndpoint = (ctx: TwoFactorContext): Endpoint => ({
  path: '/login',
  method: 'post',
  custom: { 'plugin-two-factor': true },
  handler: async (req) => {
    await addDataAndFileToRequest(req);

    const payloadReq = payloadRequest(req);
    const collection = payloadReq.payload.collections[ctx.slug];
    const data = (req.data ?? {}) as Record<string, unknown>;
    const { origin, base } = routes(req, ctx.slug);
    const returnTo =
      typeof data.returnTo === 'string' ? safeReturnTo(data.returnTo, origin) : undefined;

    if (returnTo === null) return jsonError('returnTo must be a path on this server.', 400);

    const authData =
      collection.config.auth.loginWithUsername !== false
        ? { email: text(data.email), password: text(data.password), username: text(data.username) }
        : { email: text(data.email), password: text(data.password) };

    try {
      const result = await loginOperation({
        collection,
        data: authData,
        depth: depthOf(req),
        req: payloadReq,
      });

      const cookie = generatePayloadCookie({
        collectionAuthConfig: collection.config.auth,
        cookiePrefix: payloadReq.payload.config.cookiePrefix,
        token: result.token!,
      });

      if (collection.config.auth.removeTokenFromResponses) {
        delete result.refreshToken;
        delete result.token;
      }

      return Response.json(
        { message: req.t('authentication:passed'), ...result },
        { headers: headersWithCors({ headers: new Headers({ 'Set-Cookie': cookie }), req }) },
      );
    } catch (error) {
      if (!(error instanceof TwoFactorRequired)) throw error;

      const cookie = await startPending({
        req,
        ctx,
        userId: error.userId,
        method: 'password',
        mode: error.mode,
        returnTo,
      });

      return pendingResponse({ req, mode: error.mode, url: base, cookie });
    }
  },
});

/**
 * `POST /reset-password`, Payload's handler except for a user who has two-factor sign-in on or
 * must have it: the password is saved and every session ends, and the answer is
 * `{ message, twoFactor: 'signIn' }` with no token and no cookie.
 */
export const createResetPasswordEndpoint = (ctx: TwoFactorContext): Endpoint => ({
  path: '/reset-password',
  method: 'post',
  custom: { 'plugin-two-factor': true },
  handler: async (req) => {
    await addDataAndFileToRequest(req);

    const payloadReq = payloadRequest(req);
    const collection = payloadReq.payload.collections[ctx.slug];
    const data = (req.data ?? {}) as Record<string, unknown>;

    req.context.twoFactorReset = true;

    const result = await resetPasswordOperation({
      collection,
      data: { password: text(data.password), token: text(data.token) },
      depth: depthOf(req),
      req: payloadReq,
    }).finally(() => {
      delete req.context.twoFactorReset;
    });

    const id = result.user.id as string | number;
    const user = await readUser(req, ctx.slug, id);

    if (user && (await twoFactorStep(req, ctx, user))) {
      await writeUser({ req, slug: ctx.slug, id, data: {}, sessions: 'all' });

      return Response.json(
        { message: req.t('authentication:passwordResetSuccessfully'), twoFactor: 'signIn' },
        { headers: headersWithCors({ headers: noStore(), req }) },
      );
    }

    const cookie = generatePayloadCookie({
      collectionAuthConfig: collection.config.auth,
      cookiePrefix: payloadReq.payload.config.cookiePrefix,
      token: result.token!,
    });

    if (collection.config.auth.removeTokenFromResponses) delete result.token;

    return Response.json(
      { message: req.t('authentication:passwordResetSuccessfully'), ...result },
      { headers: headersWithCors({ headers: new Headers({ 'Set-Cookie': cookie }), req }) },
    );
  },
});
