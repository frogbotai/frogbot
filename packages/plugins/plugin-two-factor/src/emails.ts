import type { FrogBotRequest } from 'frogbot';

import type { TwoFactorContext, TwoFactorEmailEvent, TwoFactorUser } from './context.js';

const notYou = "If this wasn't you, reset your password and tell an admin.";

const defaults: Record<TwoFactorEmailEvent, { subject: string; text: string }> = {
  enabled: {
    subject: 'Two-factor sign-in is on',
    text: `Two-factor sign-in was turned on for your account, and your other sessions were signed out. ${notYou}`,
  },
  disabled: {
    subject: 'Two-factor sign-in is off',
    text: `Two-factor sign-in was turned off for your account. ${notYou}`,
  },
  recoveryCodeUsed: {
    subject: 'A recovery code was used',
    text: `One of your two-factor recovery codes was just used. ${notYou}`,
  },
  recoveryCodesCreated: {
    subject: 'New recovery codes',
    text: `New two-factor recovery codes were created for your account, and the old ones no longer work. ${notYou}`,
  },
  reset: {
    subject: 'Two-factor sign-in was reset',
    text: 'An admin reset two-factor sign-in for your account and signed out every session. Sign in again to continue.',
  },
};

/** Emails the user about a two-factor event through the app's email adapter. A failed send is logged, never thrown. */
export async function sendTwoFactorEmail({
  req,
  ctx,
  event,
  user,
}: {
  req: FrogBotRequest;
  ctx: TwoFactorContext;
  event: TwoFactorEmailEvent;
  user: TwoFactorUser;
}): Promise<void> {
  const custom = ctx.options.emails[event];
  if (custom === false || typeof user.email !== 'string' || !user.email) return;

  try {
    const message = custom ? await custom({ req, user }) : defaults[event];

    await req.frogbot.email.sendEmail({ to: user.email, ...message });
  } catch (error) {
    req.frogbot.logger.error({ err: error, msg: `[plugin-two-factor] '${event}' email failed` });
  }
}
