import { createResend, type resendActions } from '@frogbotai/piece-resend';
import type { FrogBotConfig, FrogBotRequest } from 'frogbot';
import type {
  ChannelPieceInstance,
  ConnectionEntry,
  EmailPieceInstance,
  PieceInstance,
  PieceJSON,
  SignInMethod,
} from 'frogbot/pieces';
import { expectTypeOf } from 'vitest';

declare const req: FrogBotRequest;

type ResendFactoryOptions = NonNullable<Parameters<typeof createResend>[0]>;
type SendInput = {
  to: string[];
  from_name: string;
  from: string;
  bcc?: string[] | undefined;
  cc?: string[] | undefined;
  reply_to?: string | undefined;
  subject: string;
  content_type: 'html' | 'text';
  content: string;
  scheduled_at?: string | undefined;
};

const input = {
  to: ['user@example.com'],
  from_name: 'FrogBot',
  from: 'sender@example.com',
  subject: 'Welcome',
  content_type: 'text',
  content: 'Hello',
} satisfies SendInput;

const resend = createResend({ auth: { apiKey: 'key' } });
const emailConfig: Pick<FrogBotConfig, 'email'> = { email: resend };

void emailConfig;

expectTypeOf(resend).toMatchTypeOf<EmailPieceInstance>();
expectTypeOf<Exclude<keyof typeof resend, keyof PieceInstance>>().toEqualTypeOf<
  (typeof resendActions)[number]
>();
expectTypeOf<Parameters<typeof resend.send>[0]['input']>().toEqualTypeOf<SendInput>();
expectTypeOf<Parameters<typeof resend.send>[0]['req']>().toEqualTypeOf<
  FrogBotRequest | undefined
>();
expectTypeOf<Parameters<typeof resend.createDomain>[0]['input']>().toEqualTypeOf<{
  name: string;
  region?: 'us-east-1' | 'eu-west-1' | 'ap-northeast-1' | 'sa-east-1' | undefined;
}>();
expectTypeOf<
  Parameters<typeof resend.getEmailStatus>[0]['input']['email_id']
>().toEqualTypeOf<string>();
expectTypeOf<ResendFactoryOptions['auth']>().toEqualTypeOf<{ apiKey: string } | undefined>();
expectTypeOf<ResendFactoryOptions['from']>().toEqualTypeOf<
  { address: string; name?: string | undefined } | undefined
>();
expectTypeOf<ResendFactoryOptions['oauth']>().toEqualTypeOf<undefined>();

const _sent = resend.send({ input });
const _sentWithReq = resend.send({ input, req });
const _client = resend.client({});
const _domain = resend.createDomain({ input: { name: 'example.com', region: 'us-east-1' } });
const _status = resend.getEmailStatus({ input: { email_id: 'email-id', expand: true } });
expectTypeOf(resend.sendBatchEmails({ input: { emails: [] } })).toEqualTypeOf<
  Promise<PieceJSON[]>
>();

const _sendRejectsCreateDomainInput = () =>
  // @ts-expect-error send does not accept createDomain input
  resend.send({ input: { name: 'example.com', region: 'us-east-1' } });

const connected = createResend();

createResend({});
createResend({ from: { address: 'sender@example.com' } });
createResend({
  slug: 'transactional',
  auth: { apiKey: 'key' },
  from: { address: 'sender@example.com', name: 'FrogBot' },
});
const _connectedSent = connected.send({ input, req });
const _connectedClient = connected.client({ req });
expectTypeOf<Parameters<typeof connected.send>[0]['req']>().toEqualTypeOf<FrogBotRequest>();
expectTypeOf<Parameters<typeof connected.client>[0]>().toEqualTypeOf<{ req: FrogBotRequest }>();
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
