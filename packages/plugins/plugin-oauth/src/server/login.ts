import type { FrogbotRequest } from 'frogbot';
import {
  getFieldsToSign,
  jwtSign,
  LockedAuth,
  type PayloadRequest,
  resetLoginAttempts,
  type RequestContext,
  UnverifiedEmail,
} from 'payload';
import { addSessionToUser, generatePayloadCookie } from 'payload/shared';

type LoginUser = Record<string, unknown> & {
  id: string | number;
  email: string;
  _verified?: boolean;
  lockUntil?: string | null;
};

type LoginFromOAuthOptions = {
  req: FrogbotRequest;
  user: LoginUser;
  collectionSlug: string;
  returnUrl: string;
};

export function getPayloadRequest(req: FrogbotRequest): PayloadRequest {
  return req as unknown as PayloadRequest;
}

function isLocked(user: LoginUser): boolean {
  if (!user.lockUntil) return false;
  return new Date(user.lockUntil).getTime() > Date.now();
}

export async function loginFromOAuth({
  req,
  user,
  collectionSlug,
  returnUrl,
}: LoginFromOAuthOptions): Promise<Response> {
  const payloadReq = getPayloadRequest(req);
  const { payload, t } = payloadReq;
  const collectionConfig = payload.collections[collectionSlug]!.config;
  const { auth, hooks } = collectionConfig;
  const tracksLoginAttempts = auth.maxLoginAttempts > 0;

  if (auth.verify && user._verified === false) throw new UnverifiedEmail({ t });
  if (tracksLoginAttempts && isLocked(user)) throw new LockedAuth(t);

  const context = payloadReq.context || ({} as RequestContext);

  for (const hook of hooks.beforeLogin) {
    const result = await hook({ collection: collectionConfig, context, req: payloadReq, user: user as never });
    if (result) user = result as LoginUser;
  }

  payloadReq.user = user as PayloadRequest['user'];

  const { sid } = await addSessionToUser({
    collectionConfig,
    payload,
    req: payloadReq,
    user: payloadReq.user!,
  });

  if (tracksLoginAttempts) {
    await resetLoginAttempts({ collection: collectionConfig, doc: user, payload, req: payloadReq });
  }

  const fieldsToSignArgs: Parameters<typeof getFieldsToSign>[0] = {
    collectionConfig,
    email: user.email,
    user: payloadReq.user,
  };
  if (sid) fieldsToSignArgs.sid = sid;

  const { token } = await jwtSign({
    fieldsToSign: getFieldsToSign(fieldsToSignArgs),
    secret: payload.secret,
    tokenExpiration: auth.tokenExpiration,
  });

  for (const hook of hooks.afterLogin) {
    const result = await hook({ collection: collectionConfig, context, req: payloadReq, token, user: user as never });
    if (result) user = result as LoginUser;
  }

  const cookie = generatePayloadCookie({
    collectionAuthConfig: auth,
    cookiePrefix: payload.config.cookiePrefix,
    token,
  });

  return new Response(null, {
    headers: { 'Set-Cookie': cookie, Location: returnUrl },
    status: 302,
  });
}
