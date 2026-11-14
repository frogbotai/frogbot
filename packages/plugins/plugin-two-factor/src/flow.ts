import { type Endpoint, finishSignIn, type FrogBotRequest } from 'frogbot';
import QRCode from 'qrcode';

import { readCode, verifyNewSecret, withStoredCode } from './codes.js';
import {
  FIELDS,
  hasTwoFactor,
  jsonError,
  passedKey,
  readBody,
  readUser,
  routes,
  safeReturnTo,
  type TwoFactorContext,
  writeUser,
  WRONG_CODE,
} from './context.js';
import { sendTwoFactorEmail } from './emails.js';
import { withCodeLock } from './lock.js';
import {
  codePageBody,
  continueBody,
  expiredPage,
  recoveryCodesBody,
  renderPage,
  setupPageBody,
} from './page.js';
import {
  clearPendingCookie,
  deletePending,
  type PendingSignIn,
  readPending,
  updatePending,
} from './pending.js';
import { createRecoveryCodes } from './recovery.js';
import { totpURI } from './totp.js';

export const LOCKED = 'Too many wrong codes. Try again in 10 minutes.';

const EXPIRED = 'This sign-in expired or was already used. Sign in again.';

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
}: {
  req: FrogBotRequest;
  ctx: TwoFactorContext;
  pending: PendingSignIn;
  extra?: Record<string, unknown>;
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
    if (!extra) return response;

    const answer = new Headers(response.headers);
    answer.delete('content-length');

    return Response.json(
      { ...((await response.json()) as Record<string, unknown>), ...extra },
      { status: response.status, headers: answer },
    );
  }

  const returnTo = safeReturnTo(pending.returnTo ?? '', routes(req, slug).origin);
  if (!returnTo) return jsonError('returnTo must be a path on this server.', 400);

  return finishSignIn({ ...base, returnTo });
}

function fail({
  req,
  ctx,
  form,
  status,
  message,
  body,
}: {
  req: FrogBotRequest;
  ctx: TwoFactorContext;
  form: boolean;
  status: number;
  message: string;
  body?: string;
}): Response {
  if (!form) return jsonError(message, status);
  if (status === 400) return expiredPage(req, ctx.slug);

  return renderPage({ req, slug: ctx.slug, title: 'Two-factor sign-in', body: body ?? '', status });
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
        if (!found) return json ? jsonError(EXPIRED, 400) : expiredPage(req, slug);

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
          return fail({ req, ctx, form, status: 400, message: EXPIRED });
        }

        const outcome = await withStoredCode({
          req,
          ctx,
          userId: found.pending.userId,
          code: readCode(body),
          guard: async () => (await readPending(req, slug))?.id === found.id,
          fn: async ({ data }) => {
            await deletePending(req, slug, found.id);
            await writeUser({ req, slug, id: found.pending.userId, data });
          },
        });

        if (outcome.status === 'ok') return finish({ req, ctx, pending: found.pending });

        if (outcome.status === 'expired') {
          return fail({ req, ctx, form, status: 400, message: EXPIRED });
        }

        const message = outcome.status === 'locked' ? LOCKED : WRONG_CODE;

        return fail({
          req,
          ctx,
          form,
          status: outcome.status === 'locked' ? 429 : 401,
          message,
          body: codePageBody({ base, error: message }),
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
          return fail({ req, ctx, form, status: 400, message: EXPIRED });
        }

        const { id, pending } = found;

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

            const step = await verifyNewSecret({
              req,
              secret: pending.secret!,
              code: readCode(body),
            });

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

        if (outcome === 'expired') return fail({ req, ctx, form, status: 400, message: EXPIRED });

        if (outcome === 'wrong') {
          return fail({
            req,
            ctx,
            form,
            status: 401,
            message: WRONG_CODE,
            body: (await setupBody(req, ctx, pending, WRONG_CODE)).body,
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
          return fail({ req, ctx, form, status: 400, message: EXPIRED });
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
          : fail({ req, ctx, form, status: 400, message: EXPIRED });
      },
    },
  ];
};
