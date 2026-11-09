import { addDataAndFileToRequest, type Endpoint, headersWithCors } from 'frogbot';
import { registerFirstUserOperation } from 'payload';
import { generatePayloadCookie } from 'payload/shared';

import {
  jsonError,
  payloadRequest,
  readUser,
  routes,
  safeReturnTo,
  type TwoFactorContext,
  writeUser,
} from './context.js';
import { pendingResponse, startPending, text, twoFactorStep } from './login.js';

/**
 * `POST /first-register`, Payload's handler except for a first user that `require` covers: the
 * user is created, the session it started is removed, and the answer is the `202` that sends
 * them to setup, with no token. A body `returnTo` makes the setup page continue there.
 */
export const createFirstRegisterEndpoint = (ctx: TwoFactorContext): Endpoint => ({
  path: '/first-register',
  method: 'post',
  custom: { 'plugin-two-factor': true },
  handler: async (req) => {
    await addDataAndFileToRequest(req);

    const payloadReq = payloadRequest(req);
    const collection = payloadReq.payload.collections[ctx.slug];
    const { returnTo: requested, ...data } = (req.data ?? {}) as Record<string, unknown>;
    const { origin, base } = routes(req, ctx.slug);
    const returnTo = typeof requested === 'string' ? safeReturnTo(requested, origin) : undefined;

    if (returnTo === null) return jsonError('returnTo must be a path on this server.', 400);

    const authData = collection.config.auth.loginWithUsername
      ? { email: text(data.email), password: text(data.password), username: text(data.username) }
      : { email: text(data.email), password: text(data.password) };

    req.context.twoFactorFirstUser = true;

    const result = await registerFirstUserOperation({
      collection,
      data: { ...data, ...authData },
      req: payloadReq,
    }).finally(() => {
      delete req.context.twoFactorFirstUser;
    });

    const id = result.user?.id;
    const user = id === undefined ? null : await readUser(req, ctx.slug, id);
    const mode = user ? await twoFactorStep(req, ctx, user) : null;

    if (user && mode) {
      await writeUser({ req, slug: ctx.slug, id: user.id, data: {}, sessions: 'all' });

      const cookie = await startPending({
        req,
        ctx,
        userId: user.id,
        method: 'password',
        mode,
        returnTo,
      });

      return pendingResponse({ req, mode, url: base, cookie });
    }

    const cookie = generatePayloadCookie({
      collectionAuthConfig: collection.config.auth,
      cookiePrefix: payloadReq.payload.config.cookiePrefix,
      token: result.token!,
    });

    return Response.json(
      {
        exp: result.exp,
        message: req.t('authentication:successfullyRegisteredFirstUser'),
        token: result.token,
        user: result.user,
      },
      { headers: headersWithCors({ headers: new Headers({ 'Set-Cookie': cookie }), req }) },
    );
  },
});
