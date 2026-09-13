import type { SendEmailOptions, TypeWithID } from 'payload';
import type { z } from 'zod';

import type { AnyTool } from '../tools/types.js';
import type { TriggerEvent } from '../triggers/types.js';
import type { FrogbotRequest } from '../types/request.js';

export type CredentialType =
  'none' | 'oauth2' | 'secret_text' | 'basic_auth' | 'custom' | 'service_account';

export type PieceAuth = Record<string, unknown> & { allowUserOverride?: boolean };

export type PiecePolicy =
  | { type: 'none' }
  | { type: 'developer'; credential: unknown }
  | { type: 'oauth'; clientId: string; clientSecret: string }
  | { type: 'user' };

export type PieceFactoryConfig = {
  auth?: PieceAuth;
};

export type PieceToolsOptions = {
  actions?: readonly string[];
};

export type LegacyPiece = {
  service: string;
  credentialType: CredentialType;
  policy: PiecePolicy;
  actions: readonly string[];
  tool: (action: string) => AnyTool;
  tools: (options?: PieceToolsOptions) => AnyTool[];
  credentialFields?: Readonly<Record<string, { secret?: boolean }>>;
  scopes?: readonly string[];
};

export type OAuthTokens = Record<string, PieceJSON> & {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

export type OAuthApp = { clientId: string; clientSecret: string; scopes?: string[] };
export type PieceOption = { label: string; value: string };
export type PieceAdmin = { description?: string; icon?: object | string; group?: string };
export type PieceJSON =
  boolean | null | number | string | PieceJSON[] | { [key: string]: PieceJSON };
export type PieceResult = unknown;
export type PieceCallArgs<TInput, TRequireRequest extends boolean> = {
  input: TInput;
  overrideAccess?: boolean;
} & (TRequireRequest extends true ? { req: FrogbotRequest } : { req?: FrogbotRequest });

export type PieceRunArgs<TInput, TOptions, TClient> = {
  input: TInput;
  client: TClient;
  options: TOptions;
  req: FrogbotRequest;
};

export type PieceActionDefinition<
  TInput extends z.ZodType = z.ZodType,
  TOutput extends z.ZodType | undefined = z.ZodType | undefined,
  TOptions = Record<string, never>,
  TClient = never,
  TResult = TOutput extends z.ZodType ? z.output<TOutput> : PieceResult,
> = {
  slug: string;
  label?: string;
  description: string;
  input: TInput;
  output?: TOutput;
  idempotent?: boolean;
  options?: Partial<{
    [TKey in keyof z.output<TInput>]: (args: {
      input: Partial<z.output<TInput>>;
      client: TClient;
      options: TOptions;
      req: FrogbotRequest;
    }) => Promise<PieceOption[]>;
  }>;
  run(args: PieceRunArgs<z.output<TInput>, TOptions, TClient>): Promise<TResult>;
};

type PieceTriggerBase<TInput extends z.ZodType, TOutput extends z.ZodType | undefined> = {
  slug: string;
  label?: string;
  description: string;
  input: TInput;
  output?: TOutput;
  sample?: TOutput extends z.ZodType ? z.output<TOutput> : PieceJSON;
};

export type PieceWebhookTrigger<
  TInput extends z.ZodType = z.ZodType,
  TOutput extends z.ZodType | undefined = z.ZodType | undefined,
  TOptions = Record<string, never>,
  TClient = never,
  TState extends PieceResult = PieceJSON,
> = PieceTriggerBase<TInput, TOutput> & {
  type: 'webhook';
  onEnable(
    args: PieceRunArgs<z.output<TInput>, TOptions, TClient> & { webhookUrl: string },
  ): Promise<TState>;
  onDisable(
    args: PieceRunArgs<z.output<TInput>, TOptions, TClient> & { state: TState },
  ): Promise<void>;
  renew?: {
    schedule: string;
    run(
      args: PieceRunArgs<z.output<TInput>, TOptions, TClient> & {
        state: TState;
        webhookUrl: string;
      },
    ): Promise<TState>;
  };
  run(
    args: PieceRunArgs<z.output<TInput>, TOptions, TClient>,
  ): Promise<TriggerEvent<TOutput extends z.ZodType ? z.output<TOutput> : PieceJSON>[]>;
};

export type PieceAppTrigger<
  TInput extends z.ZodType = z.ZodType,
  TOutput extends z.ZodType | undefined = z.ZodType | undefined,
  TOptions = Record<string, never>,
  TClient = never,
> = PieceTriggerBase<TInput, TOutput> & {
  type: 'app';
  event: string;
  run(
    args: PieceRunArgs<z.output<TInput>, TOptions, TClient>,
  ): Promise<TriggerEvent<TOutput extends z.ZodType ? z.output<TOutput> : PieceJSON>[]>;
};

export type PiecePollingTrigger<
  TInput extends z.ZodType = z.ZodType,
  TOutput extends z.ZodType | undefined = z.ZodType | undefined,
  TOptions = Record<string, never>,
  TClient = never,
  TCursor extends PieceResult = PieceJSON,
> = PieceTriggerBase<TInput, TOutput> & {
  type: 'polling';
  schedule?: string;
  run(args: PieceRunArgs<z.output<TInput>, TOptions, TClient> & { cursor?: TCursor }): Promise<{
    events: Array<TOutput extends z.ZodType ? z.output<TOutput> : PieceJSON>;
    cursor?: TCursor;
  }>;
};

export type PieceTriggerDefinition<
  TInput extends z.ZodType = z.ZodType,
  TOutput extends z.ZodType | undefined = z.ZodType | undefined,
  TOptions = Record<string, never>,
  TClient = never,
> =
  | PieceAppTrigger<TInput, TOutput, TOptions, TClient>
  | PiecePollingTrigger<TInput, TOutput, TOptions, TClient>
  | PieceWebhookTrigger<TInput, TOutput, TOptions, TClient>;

export type PieceTriggerReference = Readonly<
  | (PieceTriggerBase<z.ZodType, z.ZodType | undefined> & {
      type: 'app';
      event: string;
    })
  | (PieceTriggerBase<z.ZodType, z.ZodType | undefined> & {
      type: 'polling' | 'webhook';
    })
>;

export type PieceOAuthAccount = { id: string; label: string; email?: string };
export type PieceOAuthRecipe<
  TAuth,
  TClient,
  TAccount extends PieceOAuthAccount = PieceOAuthAccount,
> = {
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  pkce?: boolean;
  params?: Record<string, string>;
  toAuth?: (args: { tokens: OAuthTokens }) => TAuth;
  account?(args: { tokens: OAuthTokens; client: TClient; req: FrogbotRequest }): Promise<TAccount>;
  refresh?: (args: { tokens: OAuthTokens; req: FrogbotRequest }) => Promise<OAuthTokens>;
};

export type PieceWebhook<TOptions> = {
  verify(args: { req: FrogbotRequest; options: TOptions }): Promise<boolean>;
  handshake?(args: { req: FrogbotRequest; options: TOptions }): Promise<Response | null>;
  parse?(args: { req: FrogbotRequest }): { event: string };
};

export type PieceEmail<TOptions, TClient> = {
  send(args: {
    message: SendEmailOptions;
    client: TClient;
    options: TOptions;
    req: FrogbotRequest;
  }): Promise<PieceResult>;
};

export type ChatSdkAdapter = object;
export type ChatSdkAuthor = { userId: string; username?: string };
export type PieceChannel<TAuth, TOptions, TClient> = {
  adapter(args: { auth: TAuth; options: TOptions }): ChatSdkAdapter;
  identity(args: {
    author: ChatSdkAuthor;
    client: TClient;
    req: FrogbotRequest;
  }): Promise<TypeWithID | null>;
};

export type PieceCapabilities = {
  webhook?: object;
  email?: object;
  channel?: object;
  oauth?: object;
  factoryOAuth: boolean;
  signIn: boolean;
  staticAuth: boolean;
};

export const pieceCapabilities = Symbol('pieceCapabilities');

export type PieceActionTypes = { input: unknown; output: unknown };
export type PieceTypes = {
  auth: unknown;
  options: object;
  actions: Record<string, PieceActionTypes>;
  triggers: Record<string, PieceActionTypes>;
};

export type PieceDefinition<TTypes extends PieceTypes = PieceTypes, TClient = unknown> = {
  slug: string;
  label: string;
  admin?: PieceAdmin;
  oauth?: PieceOAuthRecipe<TTypes['auth'], TClient>;
  options?: z.ZodType<TTypes['options']>;
  actions: readonly {
    [TSlug in keyof TTypes['actions'] & string]: PieceActionDefinition<
      z.ZodType<TTypes['actions'][TSlug]['input']>,
      z.ZodType<unknown, TTypes['actions'][TSlug]['output']> | undefined,
      TTypes['options'],
      TClient,
      TTypes['actions'][TSlug]['output']
    > & { slug: TSlug };
  }[keyof TTypes['actions'] & string][];
  triggers?: readonly {
    [TSlug in keyof TTypes['triggers'] & string]: PieceTriggerDefinition<
      z.ZodType<TTypes['triggers'][TSlug]['input']>,
      z.ZodType<TTypes['triggers'][TSlug]['output']>,
      TTypes['options'],
      TClient
    > & { slug: TSlug };
  }[keyof TTypes['triggers'] & string][];
  webhook?: PieceWebhook<TTypes['options']>;
  email?: PieceEmail<TTypes['options'], TClient>;
  channel?: PieceChannel<TTypes['auth'], TTypes['options'], TClient>;
} & (
  | {
      auth?: undefined;
      client?(args: { auth: undefined; options: TTypes['options'] }): TClient | Promise<TClient>;
    }
  | {
      auth: z.ZodType<TTypes['auth']>;
      client(args: {
        auth: TTypes['auth'];
        options: TTypes['options'];
      }): TClient | Promise<TClient>;
    }
);

export type PieceAction = (args: never) => Promise<unknown>;

export type PieceInstance = {
  slug: string;
  piece: string;
  oauth?: OAuthApp;
  readonly triggers: Readonly<Record<string, PieceTriggerReference>>;
  client(args: { req: FrogbotRequest }): Promise<unknown>;
  readonly [pieceCapabilities]: PieceCapabilities;
};

type FactoryOptions<T extends PieceDefinition> = {
  slug?: string;
  auth?: T extends { auth: infer TAuth extends z.ZodType } ? z.input<TAuth> : never;
  oauth?: T extends { oauth: object } ? OAuthApp : never;
} & (T extends { options: infer TOptions extends z.ZodType } ? z.input<TOptions> : object);

type DefinedCapability<T, K extends PropertyKey> =
  T extends Record<K, infer TValue> ? TValue : undefined;

type RequiresRequest<TConfig> = TConfig extends { auth: infer TAuth }
  ? undefined extends TAuth
    ? true
    : false
  : true;

type DefinedPiece<T extends PieceDefinition, TConfig> = {
  slug: string;
  piece: string;
  oauth?: OAuthApp;
  client(
    args: RequiresRequest<TConfig> extends true
      ? { req: FrogbotRequest }
      : { req?: FrogbotRequest },
  ): Promise<
    T extends { client: (...args: never[]) => infer TClient } ? Awaited<TClient> : undefined
  >;
  readonly triggers: T extends { triggers: readonly (infer TTrigger extends { slug: string })[] }
    ? { readonly [TEntry in TTrigger as TEntry['slug']]: Readonly<TEntry> }
    : Record<string, never>;
  readonly [pieceCapabilities]: {
    webhook: DefinedCapability<T, 'webhook'>;
    email: DefinedCapability<T, 'email'>;
    channel: DefinedCapability<T, 'channel'>;
    oauth: DefinedCapability<T, 'oauth'>;
    factoryOAuth: TConfig extends { oauth: OAuthApp } ? true : false;
    staticAuth: T extends { auth: z.ZodType } ? true : false;
    signIn: TConfig extends { oauth: OAuthApp }
      ? T extends { oauth: { account: (...args: never[]) => Promise<{ email: string }> } }
        ? true
        : boolean
      : false;
  };
} & {
  [TAction in T['actions'][number] as TAction['slug']]: (
    args: PieceCallArgs<z.input<TAction['input']>, RequiresRequest<TConfig>>,
  ) => TAction extends { output: infer TOutput extends z.ZodType }
    ? Promise<z.output<TOutput>>
    : ReturnType<TAction['run']>;
};

export type PieceFactory<T extends PieceDefinition> = <const TConfig extends FactoryOptions<T>>(
  ...args: object extends FactoryOptions<T> ? [config?: TConfig] : [config: TConfig]
) => DefinedPiece<T, TConfig>;

export type { ConnectionEntry } from '../connections/types.js';
export type EmailPieceInstance = PieceInstance & {
  readonly [pieceCapabilities]: PieceCapabilities & { email: object };
};
export type ChannelPieceInstance = PieceInstance & {
  readonly [pieceCapabilities]: PieceCapabilities & { channel: object };
};
export type SignInMethod = PieceInstance & {
  readonly [pieceCapabilities]: PieceCapabilities & { factoryOAuth: true; signIn: true };
};
export type SecondFactor = never;
export type Piece = LegacyPiece | PieceInstance;
export type PieceConfig = LegacyPiece;

export type SanitizedPiecesConfig =
  | {
      enabled: false;
      pieces: readonly [];
      services: Readonly<Record<string, LegacyPiece>>;
      tools: Readonly<Record<string, AnyTool>>;
      instances: readonly PieceInstance[];
    }
  | {
      enabled: true;
      pieces: readonly LegacyPiece[];
      services: Readonly<Record<string, LegacyPiece>>;
      tools: Readonly<Record<string, AnyTool>>;
      instances: readonly PieceInstance[];
    };
