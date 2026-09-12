import type { FrogbotConfig, FrogbotRequest } from 'frogbot';
import type {
  ChannelPieceInstance,
  ConnectionEntry,
  EmailPieceInstance,
  PieceInstance,
  PieceJSON,
  SignInMethod,
} from 'frogbot/pieces';
import { expectTypeOf } from 'vitest';

import type { resendActions } from './index.js';
import { createResend } from './index.js';
import type { ResendTypes } from './piece-types.js';

declare const req: FrogbotRequest;

type ResendFactoryOptions = NonNullable<Parameters<typeof createResend>[0]>;
type SendInput = ResendTypes['actions']['send']['input'];

const input = {
  to: ['user@example.com'],
  from_name: 'FrogBot',
  from: 'sender@example.com',
  subject: 'Welcome',
  content_type: 'text',
  content: 'Hello',
} satisfies SendInput;

const resend = createResend({ auth: { apiKey: 'key' } });
const emailConfig: Pick<FrogbotConfig, 'email'> = { email: resend };
void emailConfig;

expectTypeOf(resend).toMatchTypeOf<EmailPieceInstance>();
expectTypeOf<Exclude<keyof typeof resend, keyof PieceInstance>>().toEqualTypeOf<
  keyof ResendTypes['actions']
>();
expectTypeOf<(typeof resendActions)[number]>().toEqualTypeOf<keyof ResendTypes['actions']>();
expectTypeOf<Parameters<typeof resend.send>[0]['input']>().toEqualTypeOf<SendInput>();
expectTypeOf<Parameters<typeof resend.send>[0]['req']>().toEqualTypeOf<
  FrogbotRequest | undefined
>();
expectTypeOf<Parameters<typeof resend.createDomain>[0]['input']>().toEqualTypeOf<
  ResendTypes['actions']['createDomain']['input']
>();
expectTypeOf<Parameters<typeof resend.getEmailStatus>[0]['input']>().toEqualTypeOf<
  ResendTypes['actions']['getEmailStatus']['input']
>();
expectTypeOf<ResendFactoryOptions['auth']>().toEqualTypeOf<ResendTypes['auth'] | undefined>();
expectTypeOf<ResendFactoryOptions['from']>().toEqualTypeOf<ResendTypes['options']['from']>();
expectTypeOf<ResendFactoryOptions['oauth']>().toEqualTypeOf<undefined>();

resend.send({ input });
resend.send({ input, req });
resend.client({});
resend.createDomain({ input: { name: 'example.com', region: 'us-east-1' } });
resend.getEmailStatus({ input: { email_id: 'email-id', expand: true } });
expectTypeOf(resend.sendBatchEmails({ input: { emails: [] } })).toEqualTypeOf<
  Promise<PieceJSON[]>
>();

const connected = createResend();
createResend({});
createResend({ from: { address: 'sender@example.com' } });
createResend({
  slug: 'transactional',
  auth: { apiKey: 'key' },
  from: { address: 'sender@example.com', name: 'FrogBot' },
});
connected.send({ input, req });
connected.client({ req });
expectTypeOf<Parameters<typeof connected.send>[0]['req']>().toEqualTypeOf<FrogbotRequest>();
expectTypeOf<Parameters<typeof connected.client>[0]>().toEqualTypeOf<{ req: FrogbotRequest }>();
expectTypeOf<{ input: SendInput }>().not.toMatchTypeOf<Parameters<typeof connected.send>[0]>();
expectTypeOf<'missing'>().not.toMatchTypeOf<keyof typeof resend>();
expectTypeOf<{ auth: { apiKey: number } }>().not.toMatchTypeOf<ResendFactoryOptions>();
expectTypeOf<{ from: { name: string } }>().not.toMatchTypeOf<ResendFactoryOptions>();
expectTypeOf<{
  oauth: { clientId: string; clientSecret: string };
}>().not.toMatchTypeOf<ResendFactoryOptions>();
expectTypeOf<Omit<SendInput, 'to'>>().not.toMatchTypeOf<SendInput>();
expectTypeOf<
  Omit<SendInput, 'content_type'> & { content_type: 'markdown' }
>().not.toMatchTypeOf<SendInput>();

const connection: ConnectionEntry<typeof connected> = { piece: connected, secret: true };
expectTypeOf(connection.piece).toEqualTypeOf<typeof connected>();
expectTypeOf<{ piece: typeof connected; oauth: true }>().not.toMatchTypeOf<
  ConnectionEntry<typeof connected>
>();
expectTypeOf(resend).not.toMatchTypeOf<SignInMethod>();
expectTypeOf(resend).not.toMatchTypeOf<ChannelPieceInstance>();
