import { type Endpoint, finishSignIn, type FrogBotRequest } from 'frogbot';
import QRCode from 'qrcode';

import {
  codeRefusal,
  EXPIRED,
  readCode,
  type Refusal,
  refusalResponse,
  verifyNewSecret,
  withStoredCode,
  WRONG,
} from './codes.js';
import {
  FIELDS,
  hasTwoFactor,
  jsonError,
  passedKey,
  payloadRequest,
  readBody,
  readUser,
  routes,
  safeReturnTo,
  type TwoFactorContext,
  writeUser,
} from './context.js';
import { sendTwoFactorEmail } from './emails.js';
import { withCodeLock } from './lock.js';
import {
  codePageBody,
  continueBody,
  expiredPage,
  recoveryCodesBody,
  recoveryLeftBody,
  renderPage,
  setupPageBody,
} from './page.js';
import {
  clearPendingCookie,
  deletePending,
  hasPendingCookie,
  pendingCookieName,
  type PendingSignIn,
  readPending,
  updatePending,
} from './pending.js';
import { createRecoveryCodes } from './recovery.js';
import { totpURI } from './totp.js';

const ENTER_CODE = 'Enter the code from your authenticator app.';

const pendingGone = (req: FrogBotRequest, slug: string): Refusal =>
  hasPendingCookie(req, slug)
    ? EXPIRED
    : {
        status: 400,
        message: `No pending sign-in: send the \`${pendingCookieName(req, slug)}\` cookie from the sign-in response, or sign in again.`,
        code: 'pending_missing',
      };

const wantsJSON = (req: FrogBotRequest) =>
  (req.headers.get('accept') ?? '').includes('application/json');

/** The authenticator setup a pending or signed-in user scans: the key, its `otpauth://` URI and a QR code data URL. */
export async function setupDetails({
  req,
  ctx,
  secret,
  label,
}: {
  req: FrogBotRequest;
  ctx: TwoFactorContext;
  secret: string;
  label: string;
}) {
  const key = await req.frogbot.config.connections.encryption.decrypt(secret);
  const uri = totpURI({ secret: key, label, issuer: ctx.options.issuer });

  return { secret: key, uri, qrCode: await QRCode.toDataURL(uri, { margin: 1 }) };
}

async function finish({
  req,
  ctx,
  pending,
  extra,
  recoveryLeft,
}: {
  req: FrogBotRequest;
  ctx: TwoFactorContext;
  pending: PendingSignIn;
  extra?: Record<string, unknown>;
  recoveryLeft?: number;
}): Promise<Response> {
  const { slug } = ctx;
  const headers = new Headers({ 'set-cookie': clearPendingCookie(req, slug) });
  const base = {
    req,
    collectionSlug: slug,
    userId: pending.userId,
    method: pending.method,
    headers,
  };

  req.context.twoFactorPassed = passedKey(slug, pending.userId);

  if (pending.response === 'json') {
    const response = await finishSignIn({ ...base, response: 'json' });
    const added =
      recoveryLeft === undefined ? extra : { ...extra, recoveryCodesLeft: recoveryLeft };

    if (!added) return response;

    const answer = new Headers(response.headers);
    answer.delete('content-length');

    return Response.json(
      { ...((await response.json()) as Record<string, unknown>), ...added },
      { status: response.status, headers: answer },
    );
  }

  const returnTo = safeReturnTo(pending.returnTo ?? '', routes(req, slug).origin);
  if (!returnTo) return jsonError('returnTo must be a path on this server.', 400);

  const response = await finishSignIn({ ...base, returnTo });
  if (recoveryLeft === undefined) return response;

  const signedIn = new Headers();

  for (const cookie of response.headers.getSetCookie()) signedIn.append('set-cookie', cookie);

  return renderPage({
    req,
    slug,
    title: 'Signed in',
    body: recoveryLeftBody({ left: recoveryLeft, next: returnTo, account: accountURL(req, slug) }),
    headers: signedIn,
  });
}

function accountURL(req: FrogBotRequest, slug: string): string | undefined {
  const { config } = payloadRequest(req).payload;
  if (slug !== config.admin.user) return undefined;

  return `${config.routes.admin.replace(/\/+$/, '')}${config.admin.routes.account}`;
}

function fail({
  req,
  ctx,
  form,
  refusal,
  body,
}: {
  req: FrogBotRequest;
  ctx: TwoFactorContext;
  form: boolean;
  refusal: Refusal;
  body?: string;
}): Response {
  if (!form) return refusalResponse(refusal);
  if (refusal.code === 'expired' || refusal.code === 'pending_missing') {
    return expiredPage(req, ctx.slug);
  }

  return renderPage({
    req,
    slug: ctx.slug,
    title: 'Two-factor sign-in',
    body: body ?? '',
    status: refusal.status,
    headers: refusal.headers,
  });
}

async function setupBody(
  req: FrogBotRequest,
  ctx: TwoFactorContext,
  pending: PendingSignIn,
  error?: string,
) {
  const user = await readUser(req, ctx.slug, pending.userId);
  const details = await setupDetails({
    req,
    ctx,
    secret: pending.secret!,
    label: typeof user?.email === 'string' ? user.email : String(pending.userId),
  });

  return { details, body: setupPageBody({ base: routes(req, ctx.slug).base, ...details, error }) };
}

/** The pending sign-in endpoints under `/two-factor`: the code or setup page, `verify`, `setup` and `continue`. */
export const createFlowEndpoints = (ctx: TwoFactorContext): Endpoint[] => {
  const { slug } = ctx;

  return [
    {
      path: '/two-factor',
      method: 'get',
      handler: async (req) => {
        const found = await readPending(req, slug);
        const json = wantsJSON(req);
        if (!found) return json ? refusalResponse(pendingGone(req, slug)) : expiredPage(req, slug);

        const { pending } = found;
        const { base } = routes(req, slug);
        const title = 'Two-factor sign-in';

        if (pending.mode === 'code') {
          return json
            ? Response.json({ twoFactor: 'code' }, { headers: { 'cache-control': 'no-store' } })
            : renderPage({ req, slug, title, body: codePageBody({ base }) });
        }

        if (pending.confirmed) {
          return renderPage({ req, slug, title, body: continueBody({ base }) });
        }

        const { details, body } = await setupBody(req, ctx, pending);

        return json
          ? Response.json(
              { twoFactor: 'setup', ...details },
              { headers: { 'cache-control': 'no-store' } },
            )
          : renderPage({ req, slug, title, body });
      },
    },
    {
      path: '/two-factor/verify',
      method: 'post',
      handler: async (req) => {
        const { body, form } = await readBody(req);
        const found = await readPending(req, slug);
        const { base } = routes(req, slug);

        if (!found || found.pending.mode !== 'code') {
          return fail({ req, ctx, form, refusal: pendingGone(req, slug) });
        }

        const { code, refused } = readCode(body);
        if (refused) {
          return fail({
            req,
            ctx,
            form,
            refusal: refused,
            body: codePageBody({ base, error: ENTER_CODE }),
          });
        }

        const outcome = await withStoredCode({
          req,
          ctx,
          userId: found.pending.userId,
          code,
          guard: async () => (await readPending(req, slug))?.id === found.id,
          fn: async ({ data }) => {
            await deletePending(req, slug, found.id);
            await writeUser({ req, slug, id: found.pending.userId, data });

            const left = data[FIELDS.recovery];

            return Array.isArray(left) ? left.length : undefined;
          },
        });

        if (outcome.status === 'ok') {
          return finish({ req, ctx, pending: found.pending, recoveryLeft: outcome.value });
        }

        const refusal = codeRefusal(outcome);

        return fail({
          req,
          ctx,
          form,
          refusal,
          body: codePageBody({ base, error: refusal.message }),
        });
      },
    },
    {
      path: '/two-factor/setup',
      method: 'post',
      handler: async (req) => {
        const { body, form } = await readBody(req);
        const found = await readPending(req, slug);

        if (!found || found.pending.mode !== 'setup' || found.pending.confirmed) {
          return fail({ req, ctx, form, refusal: pendingGone(req, slug) });
        }

        const { id, pending } = found;
        const { code, refused } = readCode(body);

        if (refused) {
          return fail({
            req,
            ctx,
            form,
            refusal: refused,
            body: (await setupBody(req, ctx, pending, ENTER_CODE)).body,
          });
        }

        const outcome = await withCodeLock({
          req,
          slug,
          id: pending.userId,
          fn: async () => {
            const current = await readPending(req, slug);
            if (current?.id !== id || current.pending.confirmed) return 'expired' as const;
            if (hasTwoFactor(await readUser(req, slug, pending.userId))) {
              await deletePending(req, slug, id);

              return 'expired' as const;
            }

            const step = await verifyNewSecret({ req, secret: pending.secret!, code });

            if (step === null) return 'wrong' as const;

            const { codes, hashes } = createRecoveryCodes();

            await writeUser({
              req,
              slug,
              id: pending.userId,
              data: {
                [FIELDS.enabled]: true,
                [FIELDS.secret]: pending.secret,
                [FIELDS.recovery]: hashes,
                [FIELDS.lastStep]: step,
              },
              sessions: 'all',
            });

            if (pending.response === 'json') await deletePending(req, slug, id);
            else await updatePending(req, slug, id, { ...pending, confirmed: true });

            return codes;
          },
        });

        if (outcome === 'expired') return fail({ req, ctx, form, refusal: EXPIRED });

        if (outcome === 'wrong') {
          return fail({
            req,
            ctx,
            form,
            refusal: WRONG,
            body: (await setupBody(req, ctx, pending, WRONG.message)).body,
          });
        }

        const user = await readUser(req, slug, pending.userId);
        if (user) await sendTwoFactorEmail({ req, ctx, event: 'enabled', user });

        if (pending.response === 'json') {
          return finish({ req, ctx, pending, extra: { recoveryCodes: outcome } });
        }

        return renderPage({
          req,
          slug,
          title: 'Two-factor sign-in is on',
          body: recoveryCodesBody({ base: routes(req, slug).base, codes: outcome }),
        });
      },
    },
    {
      path: '/two-factor/continue',
      method: 'post',
      handler: async (req) => {
        const { form } = await readBody(req);
        const found = await readPending(req, slug);

        if (!found || found.pending.mode !== 'setup' || !found.pending.confirmed) {
          return fail({ req, ctx, form, refusal: pendingGone(req, slug) });
        }

        const consumed = await withCodeLock({
          req,
          slug,
          id: found.pending.userId,
          fn: async () => {
            if ((await readPending(req, slug))?.id !== found.id) return false;

            await deletePending(req, slug, found.id);

            const user = await readUser(req, slug, found.pending.userId);

            return hasTwoFactor(user) && user?.[FIELDS.secret] === found.pending.secret;
          },
        });

        return consumed
          ? finish({ req, ctx, pending: found.pending })
          : fail({ req, ctx, form, refusal: EXPIRED });
      },
    },
  ];
};
