import type { Endpoint, FrogBotRequest } from 'frogbot';

import { readCode, verifyNewSecret, withStoredCode } from './codes.js';
import {
  CLEARED,
  FIELDS,
  hasTwoFactor,
  jsonError,
  noStore,
  readBody,
  readUser,
  TEN_MINUTES,
  type TwoFactorContext,
  type TwoFactorUser,
  writeUser,
  WRONG_CODE,
} from './context.js';
import { sendTwoFactorEmail } from './emails.js';
import { LOCKED, setupDetails } from './flow.js';
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

  return user ? { user } : { refused: jsonError('Sign in first.', 401) };
}

function codeFailure(status: 'locked' | 'wrong' | 'expired'): Response {
  return status === 'locked' ? jsonError(LOCKED, 429) : jsonError(WRONG_CODE, 401);
}

/** The signed-in endpoints under `/two-factor`: `enable/start`, `enable`, `recovery-codes`, `disable` and `reset`. */
export const createAccountEndpoints = (ctx: TwoFactorContext): Endpoint[] => {
  const { slug, options } = ctx;

  const mayEnable = async (req: FrogBotRequest, user: TwoFactorUser) => {
    if (hasTwoFactor(user)) return jsonError('Two-factor sign-in is already on.', 409);
    if (!(await options.canEnable({ req, user }))) {
      return jsonError('You may not turn on two-factor sign-in.', 403);
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

        const { body } = await readBody(req);
        const key = enablingKey(slug, user.id);

        const codes = await withCodeLock({
          req,
          slug,
          id: user.id,
          fn: async () => {
            const secret = (await req.frogbot.kv.get(key)) as string | null;
            if (!secret) return 'expired' as const;

            const step = await verifyNewSecret({ req, secret, code: readCode(body) });
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
          return jsonError('Start turning on two-factor sign-in again.', 400);
        }

        if (codes === 'wrong') return jsonError(WRONG_CODE, 401);

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
        if (!hasTwoFactor(user)) return jsonError('Two-factor sign-in is off.', 400);

        const { body } = await readBody(req);

        const outcome = await withStoredCode({
          req,
          ctx,
          userId: user.id,
          code: readCode(body),
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

        if (outcome.status !== 'ok') return codeFailure(outcome.status);

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
        if (!hasTwoFactor(user)) return jsonError('Two-factor sign-in is off.', 400);

        if (await options.require({ req, user })) {
          return jsonError('Two-factor sign-in is required for this account.', 403);
        }

        const { body } = await readBody(req);

        const outcome = await withStoredCode({
          req,
          ctx,
          userId: user.id,
          code: readCode(body),
          fn: () => writeUser({ req, slug, id: user.id, data: CLEARED }),
        });

        if (outcome.status !== 'ok') return codeFailure(outcome.status);

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
        if (!(await options.canReset({ req }))) {
          return jsonError("You may not reset other people's two-factor sign-in.", 403);
        }

        const { body } = await readBody(req);
        const id = typeof body.id === 'string' || typeof body.id === 'number' ? body.id : undefined;
        if (id === undefined) return jsonError('Send the id of the user to reset.', 400);
        if (String(id) === String(admin.id)) {
          return jsonError("You can't reset your own two-factor sign-in.", 403);
        }

        const user = await readUser(req, slug, id);
        if (!user) return jsonError('User not found.', 404);

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
