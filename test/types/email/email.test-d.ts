import { createResend } from '@frogbotai/piece-resend';
import { definePiece, type EmailPiece, type EmailPieceInstance, type FrogbotConfig } from 'frogbot';
import type { EmailPiece as PiecesEmailPiece } from 'frogbot/pieces';
import type { EmailAdapter } from 'payload';
import { expectTypeOf } from 'vitest';
import { z } from 'zod';

const createEmail = definePiece({
  slug: 'mailer',
  label: 'Mailer',
  options: z.object({ from: z.string() }),
  actions: [],
  email: { async send() {} },
});

const email = createEmail({ from: 'sender@example.com' });
const quickbooks = definePiece({ slug: 'quickbooks', label: 'QuickBooks', actions: [] })();

expectTypeOf<EmailPiece>().toEqualTypeOf<EmailPieceInstance>();
expectTypeOf<PiecesEmailPiece>().toEqualTypeOf<EmailPiece>();
expectTypeOf<FrogbotConfig['email']>().toEqualTypeOf<
  EmailPiece | Promise<EmailPiece> | undefined
>();
expectTypeOf(email).toMatchTypeOf<EmailPiece>();
expectTypeOf(email).toMatchTypeOf<NonNullable<FrogbotConfig['email']>>();
expectTypeOf<Promise<typeof email>>().toMatchTypeOf<NonNullable<FrogbotConfig['email']>>();
expectTypeOf(quickbooks).not.toMatchTypeOf<NonNullable<FrogbotConfig['email']>>();
expectTypeOf<Promise<typeof quickbooks>>().not.toMatchTypeOf<NonNullable<FrogbotConfig['email']>>();
expectTypeOf<EmailAdapter>().not.toMatchTypeOf<NonNullable<FrogbotConfig['email']>>();
expectTypeOf<Promise<EmailAdapter>>().not.toMatchTypeOf<NonNullable<FrogbotConfig['email']>>();
expectTypeOf<'email'>().not.toMatchTypeOf<keyof typeof email>();

const directConfig = { email } satisfies Pick<FrogbotConfig, 'email'>;
const promisedConfig = { email: Promise.resolve(email) } satisfies Pick<FrogbotConfig, 'email'>;

expectTypeOf(directConfig).toMatchTypeOf<Pick<FrogbotConfig, 'email'>>();
expectTypeOf(promisedConfig).toMatchTypeOf<Pick<FrogbotConfig, 'email'>>();

const resend = createResend({
  auth: { apiKey: 'test-key' },
  from: { address: 'sender@example.com', name: 'FrogBot' },
});

const resendConfig = { email: resend } satisfies Pick<FrogbotConfig, 'email'>;
const promisedResendConfig = { email: Promise.resolve(resend) } satisfies Pick<
  FrogbotConfig,
  'email'
>;

expectTypeOf(resendConfig).toMatchTypeOf<Pick<FrogbotConfig, 'email'>>();
expectTypeOf(promisedResendConfig).toMatchTypeOf<Pick<FrogbotConfig, 'email'>>();
