import type { Adapter, Author } from 'chat';
import { expectTypeOf } from 'vitest';
import { z } from 'zod';

import type { AgentConfig, AgentInstance, AgentPieceTrigger } from '../agents/types.js';
import type {
  ConnectionEntry as DomainConnectionEntry,
  ConnectionSchema,
} from '../connections/types.js';
import type { ConnectionEntry as PublicPieceConnectionEntry } from '../exports/pieces.js';
import type { ConnectionEntry as PublicConnectionEntry, FrogbotConfig } from '../index.js';
import type { TriggerEvent } from '../triggers/types.js';
import type { FrogbotRequest } from '../types/request.js';
import { definePiece, pieceTriggerInstance } from './definePiece.js';
import type {
  ConnectionEntry,
  OAuthTokens,
  PieceDefinition,
  PieceInstance,
  SignInMethod,
} from './types.js';

declare const req: FrogbotRequest;

const empty = z.object({});
const tokenAuth = z.object({ token: z.string() });
const oauthAuth = z.object({ accessToken: z.string() });
const valueInput = z.object({ id: z.string() });
const valueOutput = z.object({ value: z.string() });
const requiredOptions = z.object({ region: z.string() });
const defaultOptions = z.object({ region: z.string().default('us-east-1') });
const triggerInput = z.object({ project: z.string() });
const triggerOutput = z.object({ id: z.string() });

type TokenClient = z.output<typeof tokenAuth>;
type OAuthClient = z.output<typeof oauthAuth>;
type TriggerState = { webhookId: string };
type PlainTypes = {
  auth: undefined;
  options: Record<string, never>;
  actions: Record<string, never>;
  triggers: Record<string, never>;
};
type CredentialedTypes = {
  auth: z.output<typeof tokenAuth>;
  options: Record<string, never>;
  actions: {
    getValue: { input: z.output<typeof valueInput>; output: z.output<typeof valueOutput> };
  };
  triggers: Record<string, never>;
};
type WidenedTypes = {
  auth: undefined;
  options: Record<string, never>;
  actions: { widened: { input: z.output<typeof empty>; output: null } };
  triggers: Record<string, never>;
};
type OAuthTypes = {
  auth: z.output<typeof oauthAuth>;
  options: Record<string, never>;
  actions: Record<string, never>;
  triggers: Record<string, never>;
};
type RequiredOptionsTypes = {
  auth: undefined;
  options: z.output<typeof requiredOptions>;
  actions: Record<string, never>;
  triggers: Record<string, never>;
};
type DefaultOptionsTypes = {
  auth: undefined;
  options: z.output<typeof defaultOptions>;
  actions: { getRegion: { input: z.output<typeof empty>; output: string } };
  triggers: Record<string, never>;
};
type ChannelTypes = {
  auth: z.output<typeof tokenAuth>;
  options: Record<string, never>;
  actions: Record<string, never>;
  triggers: Record<string, never>;
};
type TriggerTypes = {
  auth: undefined;
  options: Record<string, never>;
  actions: Record<string, never>;
  triggers: {
    created: {
      input: z.output<typeof triggerInput>;
      output: z.output<typeof triggerOutput>;
      state: TriggerState;
    };
  };
};

type TransformedTypes = Omit<PlainTypes, 'actions'> & {
  actions: { read: { input: Record<string, never>; output: string } };
};
const createTransformed = definePiece({
  slug: 'transformed',
  label: 'Transformed',
  actions: [
    {
      slug: 'read',
      description: 'Read',
      input: empty,
      output: z.string().transform(Number).pipe(z.number()),
      async run() {
        return '42';
      },
    },
  ],
} satisfies PieceDefinition<TransformedTypes, undefined>);
expectTypeOf(createTransformed().read({ input: {}, req })).toEqualTypeOf<Promise<number>>();
expectTypeOf<PieceDefinition<TransformedTypes>['actions'][number]['run']>().returns.toEqualTypeOf<
  Promise<string>
>();

const createCredentialed = definePiece({
  slug: 'credentialed',
  label: 'Credentialed',
  auth: tokenAuth,
  client: ({ auth, options }) => {
    expectTypeOf(auth).toEqualTypeOf<CredentialedTypes['auth']>();
    expectTypeOf(options).toEqualTypeOf<CredentialedTypes['options']>();
    return { token: auth.token };
  },
  actions: [
    {
      slug: 'getValue',
      description: 'Get a value',
      input: valueInput,
      output: valueOutput,
      options: {
        async id({ input, client, options, req }) {
          expectTypeOf(input).toEqualTypeOf<
            Partial<CredentialedTypes['actions']['getValue']['input']>
          >();
          expectTypeOf(client).toEqualTypeOf<TokenClient>();
          expectTypeOf(options).toEqualTypeOf<CredentialedTypes['options']>();
          expectTypeOf(req).toEqualTypeOf<FrogbotRequest>();
          return [{ label: 'Value', value: 'id' }];
        },
      },
      async run({ input, client, options, req }) {
        expectTypeOf(input).toEqualTypeOf<CredentialedTypes['actions']['getValue']['input']>();
        expectTypeOf(input.id).toEqualTypeOf<string>();
        expectTypeOf(client).toEqualTypeOf<TokenClient>();
        expectTypeOf(client.token).toEqualTypeOf<string>();
        expectTypeOf(options).toEqualTypeOf<CredentialedTypes['options']>();
        expectTypeOf(req).toEqualTypeOf<FrogbotRequest>();
        return { value: input.id };
      },
    },
  ],
} satisfies PieceDefinition<CredentialedTypes, TokenClient>);

const developer = createCredentialed({ auth: { token: 'token' } });
expectTypeOf(developer.getValue({ input: { id: 'id' } })).toEqualTypeOf<
  Promise<{ value: string }>
>();
expectTypeOf(developer.client({})).toEqualTypeOf<Promise<TokenClient>>();
const connected = createCredentialed();
const undefinedAuth = createCredentialed({ auth: undefined });
expectTypeOf(undefinedAuth.getValue({ input: { id: 'id' }, req })).toEqualTypeOf<
  Promise<{ value: string }>
>();
expectTypeOf<Parameters<typeof undefinedAuth.getValue>[0]['req']>().toEqualTypeOf<FrogbotRequest>();
expectTypeOf<Parameters<typeof undefinedAuth.client>[0]['req']>().toEqualTypeOf<FrogbotRequest>();
connected.getValue({ input: { id: 'id' }, req });
expectTypeOf(connected.client({ req })).toEqualTypeOf<Promise<TokenClient>>();
expectTypeOf<Parameters<typeof connected.client>[0]>().toEqualTypeOf<{ req: FrogbotRequest }>();
expectTypeOf<'missing'>().not.toExtend<keyof typeof connected>();
// @ts-expect-error req is required without factory auth
connected.getValue({ input: { id: 'id' } });
// @ts-expect-error unknown action
connected.missing({ input: {}, req });

const actions = [
  {
    slug: 'widened',
    description: 'Widened',
    input: empty,
    async run() {
      return null;
    },
  },
];
const widenedDefinition = {
  slug: 'widened',
  label: 'Widened',
  // @ts-expect-error factored arrays require literal slugs
  actions,
} satisfies PieceDefinition<WidenedTypes, undefined>;
void widenedDefinition;

const createWithoutOAuth = definePiece({
  slug: 'plain',
  label: 'Plain',
  actions: [],
} satisfies PieceDefinition<PlainTypes, undefined>);
createWithoutOAuth();
// @ts-expect-error oauth requires a piece recipe
createWithoutOAuth({ oauth: { clientId: 'id', clientSecret: 'secret' } });

const createOAuth = definePiece({
  slug: 'oauth',
  label: 'OAuth',
  auth: oauthAuth,
  oauth: {
    authorizationUrl: 'https://example.com/authorize',
    tokenUrl: 'https://example.com/token',
    scopes: [],
    toAuth: ({ tokens }) => {
      expectTypeOf(tokens).toEqualTypeOf<OAuthTokens>();
      return { accessToken: tokens.access_token ?? '' };
    },
  },
  client: ({ auth }) => auth,
  actions: [],
} satisfies PieceDefinition<OAuthTypes, OAuthClient>);
createOAuth({ oauth: { clientId: 'id', clientSecret: 'secret' } });

const createRequiredOptions = definePiece({
  slug: 'required-options',
  label: 'Required options',
  options: requiredOptions,
  actions: [],
} satisfies PieceDefinition<RequiredOptionsTypes, undefined>);
// @ts-expect-error required factory options require an argument
createRequiredOptions();
createRequiredOptions({ region: 'us-east-1' });

const createDefaultOptions = definePiece({
  slug: 'default-options',
  label: 'Default options',
  options: defaultOptions,
  actions: [
    {
      slug: 'getRegion',
      description: 'Get region',
      input: empty,
      async run({ input, client, options, req }) {
        expectTypeOf(input).toEqualTypeOf<DefaultOptionsTypes['actions']['getRegion']['input']>();
        expectTypeOf(client).toEqualTypeOf<undefined>();
        expectTypeOf(options).toEqualTypeOf<DefaultOptionsTypes['options']>();
        expectTypeOf(options.region).toEqualTypeOf<string>();
        expectTypeOf(req).toEqualTypeOf<FrogbotRequest>();
        return options.region;
      },
    },
  ],
} satisfies PieceDefinition<DefaultOptionsTypes, undefined>);
createDefaultOptions();
createDefaultOptions({});
createDefaultOptions({ region: 'eu-west-1' });
expectTypeOf(createDefaultOptions().getRegion({ input: {}, req })).toEqualTypeOf<Promise<string>>();

const missingClient = {
  slug: 'missing-client',
  label: 'Missing client',
  auth: tokenAuth,
  actions: [],
};
// @ts-expect-error pieces with auth require a client
definePiece(missingClient satisfies PieceDefinition<ChannelTypes, TokenClient>);

const createEmail = definePiece({
  slug: 'email',
  label: 'Email',
  actions: [],
  email: {
    async send({ message, client, options, req }) {
      expectTypeOf(message.to).not.toBeNever();
      expectTypeOf(client).toEqualTypeOf<undefined>();
      expectTypeOf(options).toEqualTypeOf<PlainTypes['options']>();
      expectTypeOf(req).toEqualTypeOf<FrogbotRequest>();
      return null;
    },
  },
} satisfies PieceDefinition<PlainTypes, undefined>);
const email = createEmail({});
const emailConfig: Pick<FrogbotConfig, 'email'> = { email };
expectTypeOf(emailConfig.email).not.toBeNever();
// @ts-expect-error a plain piece cannot fill the email slot
const invalidEmailConfig: Pick<FrogbotConfig, 'email'> = { email: createWithoutOAuth({}) };
void invalidEmailConfig;

const createChannel = definePiece({
  slug: 'channel',
  label: 'Channel',
  auth: tokenAuth,
  client: ({ auth }) => auth,
  actions: [],
  channel: {
    adapter: ({ auth, options }) => {
      expectTypeOf(auth).toEqualTypeOf<ChannelTypes['auth']>();
      expectTypeOf(options).toEqualTypeOf<ChannelTypes['options']>();
      return {} as Adapter;
    },
    async identity({ author, client, req }) {
      expectTypeOf(author).toEqualTypeOf<Author>();
      expectTypeOf(client).toEqualTypeOf<TokenClient>();
      expectTypeOf(req).toEqualTypeOf<FrogbotRequest>();
      return null;
    },
  },
} satisfies PieceDefinition<ChannelTypes, TokenClient>);
const channel = createChannel({ auth: { token: 'token' } });
const channelAgent: AgentConfig = {
  slug: 'channel-agent',
  instructions: 'Channel',
  channels: [channel],
};
expectTypeOf(channelAgent.channels).not.toBeNever();
const invalidChannelAgent: AgentConfig = {
  slug: 'invalid-channel',
  instructions: 'Invalid',
  // @ts-expect-error a plain piece cannot fill the channel slot
  channels: [createWithoutOAuth({})],
};
void invalidChannelAgent;

const createTrigger = definePiece({
  slug: 'trigger',
  label: 'Trigger',
  actions: [],
  triggers: [
    {
      slug: 'created',
      type: 'webhook',
      description: 'Created',
      input: triggerInput,
      output: triggerOutput,
      async onEnable() {
        return { webhookId: 'webhook' };
      },
      async onDisable({ state }) {
        expectTypeOf(state).toEqualTypeOf<TriggerState>();
      },
      async run({ input, client, options, req, state }) {
        expectTypeOf(input).toEqualTypeOf<TriggerTypes['triggers']['created']['input']>();
        expectTypeOf(client).toEqualTypeOf<undefined>();
        expectTypeOf(options).toEqualTypeOf<TriggerTypes['options']>();
        expectTypeOf(req).toEqualTypeOf<FrogbotRequest>();
        expectTypeOf(state).toEqualTypeOf<TriggerState>();
        return [{ dedupeKey: 'created', data: { id: input.project } }];
      },
    },
  ],
} satisfies PieceDefinition<TriggerTypes, undefined>);
const trigger = createTrigger({});
expectTypeOf(pieceTriggerInstance(trigger.triggers.created)).toEqualTypeOf<
  PieceInstance | undefined
>();
expectTypeOf<keyof typeof trigger.triggers>().toEqualTypeOf<'created'>();
expectTypeOf<ReturnType<typeof trigger.triggers.created.run>>().toEqualTypeOf<
  Promise<TriggerEvent<TriggerTypes['triggers']['created']['output']>[]>
>();
expectTypeOf<AgentPieceTrigger<typeof trigger.triggers.created>['input']>().toEqualTypeOf<
  TriggerTypes['triggers']['created']['input']
>();
const triggerAgent: AgentConfig = {
  slug: 'trigger-agent',
  instructions: 'Trigger',
  triggers: [
    {
      trigger: trigger.triggers.created,
      input: { project: 'project' },
      handler: ({ event, agent }) => {
        expectTypeOf(event).toEqualTypeOf<TriggerTypes['triggers']['created']['output']>();
        expectTypeOf(event.id).toEqualTypeOf<string>();
        expectTypeOf(agent).toEqualTypeOf<AgentInstance>();
      },
    } satisfies AgentPieceTrigger<typeof trigger.triggers.created>,
  ],
};
expectTypeOf(triggerAgent.triggers).not.toBeNever();

const inferredTriggerAgent: AgentConfig<typeof trigger.triggers.created> = {
  slug: 'inferred-trigger-agent',
  instructions: 'Trigger',
  triggers: [
    {
      trigger: trigger.triggers.created,
      input: { project: 'project' },
      handler: ({ event, agent, req }) => {
        expectTypeOf(event).toEqualTypeOf<z.output<typeof triggerOutput>>();
        expectTypeOf(agent).toEqualTypeOf<AgentInstance>();
        expectTypeOf(req).toEqualTypeOf<FrogbotRequest>();
      },
    },
    { type: 'schedule', slug: 'daily', schedule: { every: '1d' }, prompt: 'Run' },
  ],
};
expectTypeOf(inferredTriggerAgent).toExtend<AgentConfig>();
type CreatedBinding = AgentPieceTrigger<typeof trigger.triggers.created>;
expectTypeOf<{
  trigger: typeof trigger.triggers.created;
  input: { project: number };
  handler: CreatedBinding['handler'];
}>().not.toExtend<CreatedBinding>();
expectTypeOf<Omit<CreatedBinding, 'input'>>().not.toExtend<CreatedBinding>();

const unparameterizedAgent: AgentConfig = {
  slug: 'unparameterized',
  instructions: '',
  triggers: [
    {
      trigger: trigger.triggers.created,
      input: { project: 'project' },
      handler: ({ event, req }) => {
        expectTypeOf(event).toBeUnknown();
        expectTypeOf(req).toEqualTypeOf<FrogbotRequest>();
      },
    },
  ],
};
void unparameterizedAgent;

const createParsedTrigger = definePiece({
  slug: 'parsed-trigger',
  label: 'Parsed trigger',
  actions: [],
  triggers: [
    {
      slug: 'parsed',
      type: 'app',
      event: 'parsed',
      description: 'Parsed',
      input: z.object({ count: z.string().default('1').transform(Number) }),
      output: z.object({ count: z.number() }),
      async run() {
        return [{ dedupeKey: 'parsed', data: { count: 1 } }];
      },
    },
  ],
});
const parsedTrigger = createParsedTrigger();
type ParsedBinding = AgentPieceTrigger<typeof parsedTrigger.triggers.parsed>;
expectTypeOf<ParsedBinding['input']>().toEqualTypeOf<{ count?: string } | undefined>();
expectTypeOf<{
  trigger: typeof parsedTrigger.triggers.parsed;
  input: { count: number };
  handler: ParsedBinding['handler'];
}>().not.toExtend<ParsedBinding>();
const parsedAgent: AgentConfig<typeof parsedTrigger.triggers.parsed> = {
  slug: 'parsed',
  instructions: '',
  triggers: [
    {
      trigger: parsedTrigger.triggers.parsed,
      handler: ({ event }) => {
        expectTypeOf(event).toEqualTypeOf<{ count: number }>();
      },
    },
  ],
};
expectTypeOf(parsedAgent).toExtend<AgentConfig>();

const createSignIn = definePiece({
  slug: 'sign-in',
  label: 'Sign in',
  auth: oauthAuth,
  oauth: {
    authorizationUrl: 'https://example.com/authorize',
    tokenUrl: 'https://example.com/token',
    scopes: [],
    async account({ tokens, client, req }) {
      expectTypeOf(tokens).toEqualTypeOf<OAuthTokens>();
      expectTypeOf(client).toEqualTypeOf<OAuthClient>();
      expectTypeOf(req).toEqualTypeOf<FrogbotRequest>();
      return { id: 'id', label: 'Account', email: 'user@example.com' };
    },
  },
  client: ({ auth }) => auth,
  actions: [],
} satisfies PieceDefinition<OAuthTypes, OAuthClient>);
const signIn: SignInMethod = createSignIn({
  oauth: { clientId: 'id', clientSecret: 'secret' },
});
expectTypeOf(signIn).toExtend<SignInMethod>();
// @ts-expect-error sign-in requires a factory OAuth app
const missingAppSignIn: SignInMethod = createSignIn({});
void missingAppSignIn;
// @ts-expect-error sign-in requires an account recipe that returns email
const missingIdentitySignIn: SignInMethod = createOAuth({
  oauth: { clientId: 'id', clientSecret: 'secret' },
});
void missingIdentitySignIn;

const oauthConnectionPiece = createOAuth({
  oauth: { clientId: 'id', clientSecret: 'secret' },
});
const oauthConnection: ConnectionEntry<typeof oauthConnectionPiece> = {
  piece: oauthConnectionPiece,
  oauth: true,
};
const bothConnection: ConnectionEntry<typeof oauthConnectionPiece> = {
  piece: oauthConnectionPiece,
  oauth: true,
  secret: true,
};
void oauthConnection;
void bothConnection;
const secretPiece = createCredentialed();
const secretConnection: ConnectionEntry<typeof secretPiece> = {
  piece: secretPiece,
  secret: true,
};
void secretConnection;
// @ts-expect-error a connection requires at least one enabled method
const emptyConnection: ConnectionEntry<typeof oauthConnectionPiece> = {
  piece: oauthConnectionPiece,
};
void emptyConnection;
const falseConnection: ConnectionEntry<typeof oauthConnectionPiece> = {
  piece: oauthConnectionPiece,
  // @ts-expect-error false does not enable a connection method
  oauth: false,
};
void falseConnection;
const plainPiece = createWithoutOAuth();
// @ts-expect-error pieces without auth or OAuth cannot be linked
const plainConnection: ConnectionEntry<typeof plainPiece> = { piece: plainPiece, secret: true };
void plainConnection;
const oauthWithoutApp = createOAuth();
const missingAppConnection: ConnectionEntry<typeof oauthWithoutApp> = {
  piece: oauthWithoutApp,
  // @ts-expect-error OAuth linking requires a factory OAuth app
  oauth: true,
};
void missingAppConnection;

type PublicConnections = NonNullable<FrogbotConfig['connections']>;
type PublicConnection = PublicConnections[number];
expectTypeOf<PublicConnectionEntry>().toEqualTypeOf<DomainConnectionEntry>();
expectTypeOf<PublicPieceConnectionEntry>().toEqualTypeOf<DomainConnectionEntry>();
expectTypeOf<ConnectionEntry>().toEqualTypeOf<DomainConnectionEntry>();
expectTypeOf<PublicConnection>().toEqualTypeOf<DomainConnectionEntry>();
expectTypeOf<PublicConnectionEntry<typeof oauthConnectionPiece>>().toEqualTypeOf<
  PublicPieceConnectionEntry<typeof oauthConnectionPiece>
>();
expectTypeOf<PublicConnectionEntry<typeof plainPiece>>().toBeNever();
expectTypeOf<PublicConnectionEntry<typeof oauthWithoutApp>>().toEqualTypeOf<{
  piece: typeof oauthWithoutApp;
  oauth?: never;
  secret: true;
}>();
expectTypeOf<
  PublicConnectionEntry<typeof oauthConnectionPiece | typeof secretPiece>
>().toEqualTypeOf<
  PublicConnectionEntry<typeof oauthConnectionPiece> | PublicConnectionEntry<typeof secretPiece>
>();
const connectionsConfig = {
  connections: [oauthConnection, bothConnection, secretConnection],
} satisfies Pick<FrogbotConfig, 'connections'>;
expectTypeOf(connectionsConfig.connections).toExtend<PublicConnections>();
expectTypeOf<typeof oauthConnection>().toExtend<PublicConnection>();
expectTypeOf<typeof bothConnection>().toExtend<PublicConnection>();
expectTypeOf<typeof secretConnection>().toExtend<PublicConnection>();
expectTypeOf<{ piece: typeof oauthConnectionPiece }>().not.toExtend<PublicConnection>();
expectTypeOf<{
  piece: typeof oauthConnectionPiece;
  oauth: false;
  secret: false;
}>().not.toExtend<PublicConnection>();
expectTypeOf<{
  piece: typeof oauthConnectionPiece;
  oauth: boolean;
}>().not.toExtend<PublicConnection>();
expectTypeOf<{
  piece: typeof plainPiece;
  secret: true;
}>().not.toExtend<PublicConnection>();
expectTypeOf<{
  piece: typeof secretPiece;
  oauth: true;
}>().not.toExtend<PublicConnection>();
expectTypeOf<{
  piece: typeof oauthWithoutApp;
  oauth: true;
  secret: true;
}>().not.toExtend<PublicConnection>();
expectTypeOf<{ piece: PieceInstance; secret: true }>().not.toExtend<PublicConnection>();
expectTypeOf<PublicConnection['piece']>().not.toBeAny();
expectTypeOf<PublicConnection['piece']['client']>().returns.toEqualTypeOf<Promise<unknown>>();
const createOAuthOnly = definePiece({
  slug: 'oauth-only',
  label: 'OAuth only',
  oauth: {
    authorizationUrl: 'https://example.com/authorize',
    tokenUrl: 'https://example.com/token',
    scopes: [],
  },
  actions: [],
} satisfies PieceDefinition<PlainTypes, undefined>);
const oauthOnlyPiece = createOAuthOnly({
  oauth: { clientId: 'id', clientSecret: 'secret' },
});
expectTypeOf(oauthOnlyPiece).toExtend<PieceInstance>();
expectTypeOf<{
  piece: typeof oauthOnlyPiece;
  oauth: true;
}>().toExtend<PublicConnection>();
expectTypeOf<{
  piece: typeof oauthOnlyPiece;
  oauth: true;
  secret: true;
}>().not.toExtend<PublicConnection>();
expectTypeOf<ConnectionSchema>().toEqualTypeOf<z.core.JSONSchema.JSONSchema>();
expectTypeOf(z.toJSONSchema(tokenAuth, { io: 'input' })).toExtend<ConnectionSchema>();
expectTypeOf<ConnectionSchema['properties']>().toEqualTypeOf<
  Record<string, boolean | ConnectionSchema> | undefined
>();

const invalidEmailDefinition = {
  slug: 'invalid-email',
  label: 'Invalid email',
  actions: [],
  email: {
    // @ts-expect-error email callbacks receive message, client, options, and req
    async send({ auth }: { auth: string }) {
      return auth;
    },
  },
} satisfies PieceDefinition<PlainTypes, undefined>;
void invalidEmailDefinition;

const invalidTriggerDefinition = {
  slug: 'invalid-trigger',
  label: 'Invalid trigger',
  actions: [],
  triggers: [
    // @ts-expect-error webhook triggers require lifecycle callbacks
    {
      slug: 'created',
      type: 'webhook',
      description: 'Created',
      input: triggerInput,
      output: triggerOutput,
      async run() {
        return [];
      },
    },
  ],
} satisfies PieceDefinition<TriggerTypes, undefined>;
void invalidTriggerDefinition;
