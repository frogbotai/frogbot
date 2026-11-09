import { applyUserReadAccess } from 'payload/internal';
import { generatePayloadCookie } from 'payload/shared';

import { safeReturnTo } from '../../connections/oauth/state.js';
import { toPayloadRequest } from '../../seams/request.js';
import type { FrogBotRequest } from '../../types/request.js';
import { headersWithCors } from '../../utilities/request.js';
import { issueSession } from '../session.js';
import { continueLook, continuePage } from './continuePage.js';

/** Arguments for `finishSignIn`. */
export type FinishSignInArgs = {
  req: FrogBotRequest;
  collectionSlug: string;
  userId: string | number;
  /** The sign-in method's slug, or `'password'`. Set on `req.context.signIn` before the session is issued, so `beforeLogin` and `afterLogin` hooks can tell a resumed sign-in from a plain password login. */
  method: string;
  /** Headers added to the response, such as a `set-cookie` that clears a plugin's own cookie. */
  headers?: Headers;
} & (
  | {
      /** Answer with a page that continues to `returnTo`, as a sign-in method's callback does. */
      response?: 'page';
      /** A path on the server's origin; anything else throws before a session is issued. */
      returnTo: string;
    }
  | {
      /** Answer like Payload's `POST /login`: `{ message, user, token, exp }` with the auth cookie set. */
      response: 'json';
      returnTo?: never;
    }
);

/** Issues a session for a user whose sign-in was paused, sets the auth cookie and answers the request. A sign-in method's callback ends with it, and a plugin that paused sign-in from a `beforeSignIn` hook resumes with it. */
export async function finishSignIn(args: FinishSignInArgs): Promise<Response> {
  const { req, collectionSlug, userId, method } = args;
  const config = await req.frogbot.config._internal.payloadConfig;
  const collection = config.collections.find(({ slug }) => slug === collectionSlug);
  if (!collection?.auth) {
    throw new Error(`[frogbot] '${collectionSlug}' is not an auth collection.`);
  }

  const returnTo =
    args.response === 'json'
      ? undefined
      : safeReturnTo(args.returnTo, config.serverURL || new URL(req.url!).origin);

  req.context.signIn = { method };
  const { user, token, exp } = await issueSession({ req, collectionSlug, userId });
  const headers = new Headers(args.headers);
  headers.set('cache-control', 'no-store');

  headers.append(
    'set-cookie',
    generatePayloadCookie({
      collectionAuthConfig: collection.auth,
      cookiePrefix: config.cookiePrefix,
      token,
    }),
  );

  if (returnTo === undefined) {
    const { sessions: _sessions, ...readable } = await applyUserReadAccess({
      collection,
      overrideAccess: false,
      req: toPayloadRequest(req),
      showHiddenFields: false,
      user,
    });

    return Response.json(
      {
        message: req.t('authentication:passed'),
        user: readable,
        ...(collection.auth.removeTokenFromResponses ? {} : { token }),
        exp,
      },
      { headers: headersWithCors({ headers, req }) },
    );
  }

  return continuePage({
    returnTo,
    look: continueLook({ config, collectionSlug, returnTo, headers: req.headers }),
    lang: req.i18n.language,
    t: req.t,
    headers,
  });
}
