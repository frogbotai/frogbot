import { createResend } from '@frogbotai/piece-resend';
import { definePiece, type EmailPiece, type EmailPieceInstance, type FrogBotConfig } from 'frogbot';
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
expectTypeOf<FrogBotConfig['email']>().toEqualTypeOf<
  EmailPiece | Promise<EmailPiece> | undefined
>();
expectTypeOf(email).toMatchTypeOf<EmailPiece>();
expectTypeOf(email).toMatchTypeOf<NonNullable<FrogBotConfig['email']>>();
expectTypeOf<Promise<typeof email>>().toMatchTypeOf<NonNullable<FrogBotConfig['email']>>();
expectTypeOf(quickbooks).not.toMatchTypeOf<NonNullable<FrogBotConfig['email']>>();
expectTypeOf<Promise<typeof quickbooks>>().not.toMatchTypeOf<NonNullable<FrogBotConfig['email']>>();
expectTypeOf<EmailAdapter>().not.toMatchTypeOf<NonNullable<FrogBotConfig['email']>>();
expectTypeOf<Promise<EmailAdapter>>().not.toMatchTypeOf<NonNullable<FrogBotConfig['email']>>();
expectTypeOf<'email'>().not.toMatchTypeOf<keyof typeof email>();

const directConfig = { email } satisfies Pick<FrogBotConfig, 'email'>;
const promisedConfig = { email: Promise.resolve(email) } satisfies Pick<FrogBotConfig, 'email'>;

expectTypeOf(directConfig).toMatchTypeOf<Pick<FrogBotConfig, 'email'>>();
expectTypeOf(promisedConfig).toMatchTypeOf<Pick<FrogBotConfig, 'email'>>();

const resend = createResend({
  auth: { apiKey: 'test-key' },
  from: { address: 'sender@example.com', name: 'FrogBot' },
});

const resendConfig = { email: resend } satisfies Pick<FrogBotConfig, 'email'>;
const promisedResendConfig = { email: Promise.resolve(resend) } satisfies Pick<
  FrogBotConfig,
  'email'
>;

expectTypeOf(resendConfig).toMatchTypeOf<Pick<FrogBotConfig, 'email'>>();
expectTypeOf(promisedResendConfig).toMatchTypeOf<Pick<FrogBotConfig, 'email'>>();
