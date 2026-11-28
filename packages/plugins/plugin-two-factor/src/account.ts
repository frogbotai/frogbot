import { type Endpoint, frogbotError, type FrogBotRequest } from 'frogbot';
import { combineQueries, executeAccess } from 'payload';

import {
  codeRefusal,
  readCode,
  refusalResponse,
  verifyNewSecret,
  withStoredCode,
  WRONG,
} from './codes.js';
import {
  CLEARED,
  FIELDS,
  hasTwoFactor,
  jsonError,
  noStore,
  payloadRequest,
  problemError,
  readBody,
  readUser,
  TEN_MINUTES,
  type TwoFactorContext,
  type TwoFactorUser,
  writeUser,
} from './context.js';
import { sendTwoFactorEmail } from './emails.js';
import { setupDetails } from './flow.js';
import { clearCodeFailures, withCodeLock } from './lock.js';
import { createRecoveryCodes } from './recovery.js';
import { createTOTPSecret } from './totp.js';

const enablingKey = (slug: string, id: string | number) =>
  `two-factor:enabling:${JSON.stringify([slug, id])}`;

const ok = (body: Record<string, unknown>) => Response.json(body, { headers: noStore() });

const label = (user: TwoFactorUser) =>
  typeof user.email === 'string' && user.email ? user.email : String(user.id);

async function signedIn(
  req: FrogBotRequest,
  ctx: TwoFactorContext,
): Promise<{ user: TwoFactorUser; refused?: never } | { user?: never; refused: Response }> {
  const user =
    req.user?.collection === ctx.slug ? await readUser(req, ctx.slug, req.user.id) : null;

  return user ? { user } : { refused: problemError(req, frogbotError('auth.unauthenticated')) };
}

async function findResettable(
  req: FrogBotRequest,
  slug: string,
  id: string | number,
): Promise<TwoFactorUser | 'forbidden' | null> {
  const payloadReq = payloadRequest(req);
  const visible = await payloadReq.payload.count({
    collection: slug,
    overrideAccess: false,
    req: payloadReq,
    where: { id: { equals: id } },
  });

  if (!visible.totalDocs) return null;

  const access = await executeAccess(
    { slug, req: payloadReq },
    payloadReq.payload.collections[slug].config.access.update,
  );

  if (typeof access === 'object') {
    const updatable = await payloadReq.payload.db.count({
      collection: slug,
      req: payloadReq,
      where: combineQueries({ id: { equals: id } }, access),
    });

    if (!updatable.totalDocs) return 'forbidden';
  }

  return readUser(req, slug, id);
}

/** The signed-in endpoints under `/two-factor`: `enable/start`, `enable`, `recovery-codes`, `disable` and `reset`. */
export const createAccountEndpoints = (ctx: TwoFactorContext): Endpoint[] => {
  const { slug, options } = ctx;

  const mayEnable = async (req: FrogBotRequest, user: TwoFactorUser) => {
    if (hasTwoFactor(user)) return jsonError(req, 'two-factor.already-on');
    if (!(await options.canEnable({ req, user }))) {
      return jsonError(req, 'two-factor.not-allowed', {
        detail: "This user can't turn on two-factor sign-in.",
      });
    }

    return null;
  };

  return [
    {
      path: '/two-factor/enable/start',
      method: 'post',
      handler: async (req) => {
        const { user, refused: anonymous } = await signedIn(req, ctx);
        if (anonymous) return anonymous;

        const refused = await mayEnable(req, user);
        if (refused) return refused;

        const secret = await req.frogbot.config.connections.encryption.encrypt(createTOTPSecret());

        await req.frogbot.kv.set(enablingKey(slug, user.id), secret, { ttl: TEN_MINUTES });

        return ok(await setupDetails({ req, ctx, secret, label: label(user) }));
      },
    },
    {
      path: '/two-factor/enable',
      method: 'post',
      handler: async (req) => {
        const { user, refused: anonymous } = await signedIn(req, ctx);
        if (anonymous) return anonymous;

        const refused = await mayEnable(req, user);
        if (refused) return refused;

        const { code, refused: unread } = readCode((await readBody(req)).body);
        if (unread) return refusalResponse(req, unread);
        const key = enablingKey(slug, user.id);

        const codes = await withCodeLock({
          req,
          slug,
          id: user.id,
          fn: async () => {
            const secret = (await req.frogbot.kv.get(key)) as string | null;
            if (!secret || hasTwoFactor(await readUser(req, slug, user.id))) {
              return 'expired' as const;
            }

            const step = await verifyNewSecret({ req, secret, code });
            if (step === null) return 'wrong' as const;

            const { codes, hashes } = createRecoveryCodes();

            await writeUser({
              req,
              slug,
              id: user.id,
              data: {
                [FIELDS.enabled]: true,
                [FIELDS.secret]: secret,
                [FIELDS.recovery]: hashes,
                [FIELDS.lastStep]: step,
              },
              sessions: 'others',
              keep: typeof req.user?._sid === 'string' ? req.user._sid : undefined,
            });

            await req.frogbot.kv.delete(key);

            return codes;
          },
        });

        if (codes === 'expired') {
          return jsonError(req, 'two-factor.expired', {
            detail: 'Start turning on two-factor sign-in again.',
          });
        }

        if (codes === 'wrong') return refusalResponse(req, WRONG);

        await sendTwoFactorEmail({ req, ctx, event: 'enabled', user });

        return ok({ message: 'Two-factor sign-in is on.', recoveryCodes: codes });
      },
    },
    {
      path: '/two-factor/recovery-codes',
      method: 'post',
      handler: async (req) => {
        const { user, refused: anonymous } = await signedIn(req, ctx);
        if (anonymous) return anonymous;
        if (!hasTwoFactor(user)) return jsonError(req, 'two-factor.off');

        const { code, refused: unread } = readCode((await readBody(req)).body);
        if (unread) return refusalResponse(req, unread);

        const outcome = await withStoredCode({
          req,
          ctx,
          userId: user.id,
          code,
          fn: async ({ data }) => {
            const { codes, hashes } = createRecoveryCodes();

            await writeUser({
              req,
              slug,
              id: user.id,
              data: { ...data, [FIELDS.recovery]: hashes },
            });

            return codes;
          },
        });

        if (outcome.status !== 'ok') return refusalResponse(req, codeRefusal(outcome));

        await sendTwoFactorEmail({ req, ctx, event: 'recoveryCodesCreated', user });

        return ok({ message: 'New recovery codes are ready.', recoveryCodes: outcome.value });
      },
    },
    {
      path: '/two-factor/disable',
      method: 'post',
      handler: async (req) => {
        const { user, refused: anonymous } = await signedIn(req, ctx);
        if (anonymous) return anonymous;
        if (!hasTwoFactor(user)) return jsonError(req, 'two-factor.off');

        if (await options.require({ req, user })) {
          return jsonError(req, 'two-factor.required');
        }

        const { code, refused: unread } = readCode((await readBody(req)).body);
        if (unread) return refusalResponse(req, unread);

        const outcome = await withStoredCode({
          req,
          ctx,
          userId: user.id,
          code,
          fn: () => writeUser({ req, slug, id: user.id, data: CLEARED }),
        });

        if (outcome.status !== 'ok') return refusalResponse(req, codeRefusal(outcome));

        await sendTwoFactorEmail({ req, ctx, event: 'disabled', user });

        return ok({ message: 'Two-factor sign-in is off.' });
      },
    },
    {
      path: '/two-factor/reset',
      method: 'post',
      handler: async (req) => {
        const { user: admin, refused: anonymous } = await signedIn(req, ctx);
        if (anonymous) return anonymous;

        const { body } = await readBody(req);
        const id =
          typeof body?.id === 'string' || typeof body?.id === 'number' ? body.id : undefined;

        if (id === undefined) {
          return problemError(
            req,
            frogbotError('request.invalid', {
              detail: 'Send the id of the user to reset.',
              fields: [{ path: 'id', message: 'Send the id of the user to reset.' }],
            }),
          );
        }

        if (String(id) === String(admin.id)) {
          return jsonError(req, 'two-factor.not-allowed', {
            detail: "You can't reset your own two-factor sign-in.",
          });
        }

        const user = await findResettable(req, slug, id);
        if (!user) return problemError(req, frogbotError('doc.not-found', 'User not found.'));
        if (user === 'forbidden' || !(await options.canReset({ req, user }))) {
          return jsonError(req, 'two-factor.not-allowed', {
            detail: "This user can't reset that user's two-factor sign-in.",
          });
        }

        await withCodeLock({
          req,
          slug,
          id: user.id,
          fn: async () => {
            await writeUser({ req, slug, id: user.id, data: CLEARED, sessions: 'all' });
            await clearCodeFailures(req, slug, user.id);
            await req.frogbot.kv.delete(enablingKey(slug, user.id));
          },
        });

        await sendTwoFactorEmail({ req, ctx, event: 'reset', user });

        return ok({ message: 'Two-factor sign-in was reset.' });
      },
    },
  ];
};
