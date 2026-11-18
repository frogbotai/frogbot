import type { FrogBotRequest } from 'frogbot';

import {
  FIELDS,
  hasTwoFactor,
  jsonError,
  readUser,
  type RefusalCode,
  type TwoFactorContext,
  type TwoFactorUser,
  WRONG_CODE,
} from './context.js';
import { sendTwoFactorEmail } from './emails.js';
import { clearCodeFailures, codeLockSeconds, recordCodeFailure, withCodeLock } from './lock.js';
import { spendRecoveryCode } from './recovery.js';
import { verifyTOTP } from './totp.js';

export type CodeOutcome<T> =
  | { status: 'ok'; value: T }
  | { status: 'locked'; retryAfter: number }
  | { status: 'wrong' | 'expired' };

/** A refused request: the status, message, `data.code` and headers it answers with. */
export type Refusal = {
  status: number;
  message: string;
  code: RefusalCode;
  headers?: HeadersInit;
};

export const LOCKED = 'Too many wrong codes. Try again in 10 minutes.';

export const EXPIRED: Refusal = {
  status: 400,
  message: 'This sign-in expired or was already used. Sign in again.',
  code: 'expired',
};

export const WRONG: Refusal = { status: 401, message: WRONG_CODE, code: 'wrong_code' };

export const refusalResponse = ({ status, message, code, headers }: Refusal) =>
  jsonError(message, status, { code, headers });

/** The refusal for a code that wasn't accepted. */
export function codeRefusal(outcome: Exclude<CodeOutcome<unknown>, { status: 'ok' }>): Refusal {
  if (outcome.status !== 'locked') return outcome.status === 'expired' ? EXPIRED : WRONG;

  return {
    status: 429,
    message: LOCKED,
    code: 'locked',
    headers: { 'retry-after': String(outcome.retryAfter) },
  };
}

/**
 * Reads the submitted code from a JSON or form body: a string, or a whole number of up to six
 * digits, as a client that parsed the code as a number sends it. Anything else is refused before
 * it can count as a wrong code.
 */
export function readCode(
  body: Record<string, unknown> | null,
): { code: string; refused?: never } | { code?: never; refused: Refusal } {
  if (!body) {
    return {
      refused: {
        status: 400,
        message: 'Send JSON or a URL-encoded form body, e.g. {"code":"123456"}.',
        code: 'body_unreadable',
      },
    };
  }

  const { code } = body;

  if (typeof code === 'string' && code.trim()) return { code: code.trim() };
  if (typeof code === 'number' && Number.isInteger(code) && code >= 0 && code < 1_000_000) {
    return { code: String(code).padStart(6, '0') };
  }

  return {
    refused: {
      status: 400,
      message: 'Send the code as a string in `code`, e.g. {"code":"123456"}.',
      code: 'code_missing',
    },
  };
}

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
      const retryAfter = await codeLockSeconds(req, slug, userId);
      if (retryAfter > 0) return { status: 'locked', retryAfter };

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
