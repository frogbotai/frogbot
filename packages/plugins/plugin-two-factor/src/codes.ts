import type { FrogBotRequest } from 'frogbot';

import {
  FIELDS,
  hasTwoFactor,
  readUser,
  type TwoFactorContext,
  type TwoFactorUser,
} from './context.js';
import { sendTwoFactorEmail } from './emails.js';
import { clearCodeFailures, isCodeLocked, recordCodeFailure, withCodeLock } from './lock.js';
import { spendRecoveryCode } from './recovery.js';
import { verifyTOTP } from './totp.js';

export type CodeOutcome<T> =
  { status: 'ok'; value: T } | { status: 'locked' | 'wrong' | 'expired' };

/** Reads a submitted code from a JSON or form body. */
export const readCode = (body: Record<string, unknown>) =>
  typeof body.code === 'string' ? body.code.trim() : '';

async function matchStoredCode({
  req,
  user,
  code,
}: {
  req: FrogBotRequest;
  user: TwoFactorUser;
  code: string;
}): Promise<{ data: Record<string, unknown>; recovery: boolean } | null> {
  if (!hasTwoFactor(user) || !user.twoFactorSecret) return null;

  const secret = await req.frogbot.config.connections.encryption.decrypt(user.twoFactorSecret);
  const step = verifyTOTP({ secret, code, lastStep: user.twoFactorLastStep });
  if (step !== null) return { data: { [FIELDS.lastStep]: step }, recovery: false };

  const remaining = spendRecoveryCode({ code, hashes: user.twoFactorRecovery ?? [] });

  return remaining ? { data: { [FIELDS.recovery]: remaining }, recovery: true } : null;
}

/**
 * Checks a code against the user's stored factor inside the user's code lock. Five wrong codes in
 * ten minutes lock code entry, and a right one clears the count. `guard` runs first under the
 * lock; `fn` gets the field writes that use the code and must save them.
 */
export async function withStoredCode<T>({
  req,
  ctx,
  userId,
  code,
  guard,
  fn,
}: {
  req: FrogBotRequest;
  ctx: TwoFactorContext;
  userId: string | number;
  code: string;
  guard?: () => Promise<boolean>;
  fn: (args: { user: TwoFactorUser; data: Record<string, unknown> }) => Promise<T>;
}): Promise<CodeOutcome<T>> {
  const { slug } = ctx;

  return withCodeLock({
    req,
    slug,
    id: userId,
    fn: async (): Promise<CodeOutcome<T>> => {
      if (guard && !(await guard())) return { status: 'expired' };
      if (await isCodeLocked(req, slug, userId)) return { status: 'locked' };

      const user = await readUser(req, slug, userId);
      const match = user && (await matchStoredCode({ req, user, code }));

      if (!user || !match) {
        await recordCodeFailure(req, slug, userId);

        return { status: 'wrong' };
      }

      await clearCodeFailures(req, slug, userId);

      const value = await fn({ user, data: match.data });

      if (match.recovery) await sendTwoFactorEmail({ req, ctx, event: 'recoveryCodeUsed', user });

      return { status: 'ok', value };
    },
  });
}

/** Checks the first code for a secret that isn't saved yet, refusing nothing but a wrong code. */
export async function verifyNewSecret({
  req,
  secret,
  code,
}: {
  req: FrogBotRequest;
  secret: string;
  code: string;
}): Promise<number | null> {
  return verifyTOTP({
    secret: await req.frogbot.config.connections.encryption.decrypt(secret),
    code,
  });
}
