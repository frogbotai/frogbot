import type { CallCredentialResult, CallCredentialVia } from '@frogbotai/gateway';
import type { Adapter, Author } from 'chat';
import type { SendEmailOptions } from 'payload';
import type { z } from 'zod';

import type { ProviderName } from '../ai/providerNames.js';
import type { PieceChannelQuestions } from '../channels/questions/types.js';
import type { ToolApprovalOption } from '../tools/approval.js';
import type { Tool, ToolAnnotations } from '../tools/types.js';
import type { TriggerEvent } from '../triggers/types.js';
import type { TypedUser } from '../types/generated.js';
import type { FrogBotRequest } from '../types/request.js';
import type { CustomApiCallAction, CustomApiCallConfig } from './customApiCall.js';

export type OAuthTokens = Record<string, PieceJSON> & {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

export type OAuthApp = { clientId: string; clientSecret: string };

export type PieceOption = { label: string; value: string };

export type PieceAdmin = { description?: string; icon?: object | string; group?: string };

export type PieceJSON =
  boolean | null | number | string | PieceJSON[] | { [key: string]: PieceJSON };

export type PieceResult = unknown;

export type PieceCallArgs<TInput, TRequireRequest extends boolean> = {
  input: TInput;
  overrideAccess?: boolean;
  /** Pins one of the user's linked accounts by row id; omitted, the default account is used. */
  connection?: number | string;
  /** The app slot whose shared account the call uses, by its `app` name in `connections`. */
  as?: string;
} & (TRequireRequest extends true ? { req: FrogBotRequest } : { req?: FrogBotRequest });

export type PieceRunArgs<TInput, TOptions, TClient> = {
  input: TInput;
  client: TClient;
  options: TOptions;
  req: FrogBotRequest;
  /**
   * Whether the run is trusted: the agent run's flag when an agent calls the action, the call's
   * `overrideAccess` (default `false`) on a direct call. Forward it to Local API calls.
   */
  overrideAccess: boolean;
};

type PieceTriggerArgs<TInput, TOptions, TClient> = Omit<
  PieceRunArgs<TInput, TOptions, TClient>,
  'overrideAccess'
>;

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
  /** Calling it again with the same input does nothing more. Fills `annotations.idempotentHint`. */
  idempotent?: boolean;
  /** Hints for clients about what a call does, copied onto the action's tool. */
  annotations?: ToolAnnotations;
  /** Whether a person approves each call when an agent runs this action. @default false */
  approval?: ToolApprovalOption;
  options?: Partial<{
    [TKey in keyof z.output<TInput>]: (args: {
      input: Partial<z.output<TInput>>;
      client: TClient;
      options: TOptions;
      req: FrogBotRequest;
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
    args: PieceTriggerArgs<z.output<TInput>, TOptions, TClient> & { webhookUrl: string },
  ): Promise<TState>;
  onDisable(
    args: PieceTriggerArgs<z.output<TInput>, TOptions, TClient> & { state: TState },
  ): Promise<void>;
  renew?: {
    schedule: string;
    run(
      args: PieceTriggerArgs<z.output<TInput>, TOptions, TClient> & {
        state: TState;
        webhookUrl: string;
      },
    ): Promise<TState>;
  };
  run(
    args: PieceTriggerArgs<z.output<TInput>, TOptions, TClient> & { state: TState },
  ): Promise<TriggerEvent<TOutput extends z.ZodType ? z.output<TOutput> : PieceJSON>[]>;
  /**
   * The answer to the provider once `run`'s events are dispatched, for providers that expect a set
   * body. Not called when `run` throws. @default `{ ok: true }` as JSON
   */
  reply?(
    args: PieceTriggerArgs<z.output<TInput>, TOptions, TClient> & {
      state: TState;
      events: TriggerEvent<TOutput extends z.ZodType ? z.output<TOutput> : PieceJSON>[];
    },
  ): Response | Promise<Response>;
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
    args: PieceTriggerArgs<z.output<TInput>, TOptions, TClient>,
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
  run(args: PieceTriggerArgs<z.output<TInput>, TOptions, TClient> & { cursor?: TCursor }): Promise<{
    events: Array<TOutput extends z.ZodType ? z.output<TOutput> : PieceJSON>;
    cursor?: TCursor;
  }>;
};

export type PieceTriggerDefinition<
  TInput extends z.ZodType = z.ZodType,
  TOutput extends z.ZodType | undefined = z.ZodType | undefined,
  TOptions = Record<string, never>,
  TClient = never,
  TState extends PieceResult = unknown,
> =
  | PieceAppTrigger<TInput, TOutput, TOptions, TClient>
  | PiecePollingTrigger<TInput, TOutput, TOptions, TClient>
  | PieceWebhookTrigger<TInput, TOutput, TOptions, TClient, TState>;

type AfterOutputInference<TOutput, TDefinition> = TOutput extends unknown ? TDefinition : never;

export type PieceHelpers<TClient, TOptions> = {
  defineCustomApiCall(config: CustomApiCallConfig<TClient>): CustomApiCallAction<TOptions, TClient>;
  defineAction<
    const TSlug extends string,
    TInput extends z.ZodType,
    TOutput extends z.ZodType | undefined = undefined,
    TResult = PieceResult,
  >(
    action: AfterOutputInference<
      TOutput,
      PieceActionDefinition<
        TInput,
        TOutput,
        TOptions,
        TClient,
        TOutput extends z.ZodType ? z.output<TOutput> : TResult
      > & { slug: TSlug }
    >,
  ): PieceActionDefinition<
    TInput,
    TOutput,
    TOptions,
    TClient,
    TOutput extends z.ZodType ? z.output<TOutput> : TResult
  > & { slug: TSlug };
  defineAppTrigger<
    const TSlug extends string,
    TInput extends z.ZodType,
    TOutput extends z.ZodType | undefined = undefined,
  >(
    trigger: AfterOutputInference<
      TOutput,
      PieceAppTrigger<TInput, TOutput, TOptions, TClient> & { slug: TSlug }
    >,
  ): PieceAppTrigger<TInput, TOutput, TOptions, TClient> & { slug: TSlug };
  definePollingTrigger<
    const TSlug extends string,
    TInput extends z.ZodType,
    TOutput extends z.ZodType | undefined = undefined,
  >(
    trigger: AfterOutputInference<
      TOutput,
      PiecePollingTrigger<TInput, TOutput, TOptions, TClient> & { slug: TSlug }
    >,
  ): PiecePollingTrigger<TInput, TOutput, TOptions, TClient> & { slug: TSlug };
  defineWebhookTrigger<
    const TSlug extends string,
    TInput extends z.ZodType,
    TOutput extends z.ZodType | undefined = undefined,
    TState extends PieceResult = PieceJSON,
  >(
    trigger: PieceWebhookTrigger<TInput, TOutput, TOptions, TClient, TState> & { slug: TSlug },
  ): PieceWebhookTrigger<TInput, TOutput, TOptions, TClient, TState> & { slug: TSlug };
};

export type PieceTriggerReference = Readonly<
  | (PieceTriggerBase<z.ZodType, z.ZodType | undefined> & {
      type: 'app';
      event: string;
    })
  | (PieceTriggerBase<z.ZodType, z.ZodType | undefined> & {
      type: 'polling';
      schedule?: string;
    })
  | (PieceTriggerBase<z.ZodType, z.ZodType | undefined> & {
      type: 'webhook';
    })
>;

export type PieceOAuthAccount = { id: string; label: string; email?: string };

/**
 * A recipe's scopes: short names mapped to provider strings, the names requested by default,
 * and the names always requested because `account()` or refresh needs them.
 */
export type PieceOAuthScopes<TScope extends string = string> = {
  catalog: Readonly<Record<TScope, string>>;
  defaults: readonly TScope[];
  required?: readonly TScope[];
};

type PieceOAuthShared<TAuth, TScope extends string> = {
  scopes: PieceOAuthScopes<TScope>;
  toAuth?: (args: { tokens: OAuthTokens }) => TAuth;
  auth?: z.ZodType<TAuth>;
  revoke?(args: { tokens: OAuthTokens; req: FrogBotRequest }): Promise<void>;
  label?: string;
  tokenLifetime?: number;
};

export type PieceOAuthRecipe<
  TAuth,
  TClient,
  TAccount extends PieceOAuthAccount = PieceOAuthAccount,
  TScope extends string = string,
> = PieceOAuthShared<TAuth, TScope> & {
  authorizationUrl: string;
  tokenUrl: string;
  tokenEndpointAuthMethod?: 'client_secret_basic' | 'client_secret_post';
  scopeSeparator?: ' ' | ',';
  pkce?: boolean;
  params?: Record<string, string>;
  account?(args: { tokens: OAuthTokens; client: TClient; req: FrogBotRequest }): Promise<TAccount>;
  refresh?: (args: { tokens: OAuthTokens; req: FrogBotRequest }) => Promise<OAuthTokens>;
  authorize?: never;
};

/** Stores a finished piece-run sign-in as the starting user's linked account. */
export type PieceOAuthSave = (args: {
  tokens: OAuthTokens;
  account: PieceOAuthAccount;
}) => Promise<void>;

/**
 * An OAuth sign-in the piece runs itself, for providers core's redirect flow can't serve. The
 * app needs no client ID or secret; the piece handles the provider's callback and calls `save`.
 */
export type PieceOAuthSignIn<TAuth, TScope extends string = string> = PieceOAuthShared<
  TAuth,
  TScope
> & {
  /** Starts a sign-in and returns the URL to send the browser to. `returnTo` is absolute. */
  authorize(args: { req: FrogBotRequest; returnTo: string; save: PieceOAuthSave }): Promise<string>;
  refresh(args: { tokens: OAuthTokens; req: FrogBotRequest }): Promise<OAuthTokens>;
  authorizationUrl?: never;
  tokenUrl?: never;
  tokenEndpointAuthMethod?: never;
  scopeSeparator?: never;
  pkce?: never;
  params?: never;
  account?: never;
};

export type PieceWebhook<TOptions> = {
  verify?(args: { req: FrogBotRequest; options: TOptions }): Promise<boolean>;
  handshake?(args: { req: FrogBotRequest; options: TOptions }): Promise<Response | null>;
  parse?(args: { req: FrogBotRequest }): { event: string };
};

export type PieceEmail<TOptions, TClient> = {
  send(args: {
    message: SendEmailOptions;
    client: TClient;
    options: TOptions;
    req: FrogBotRequest;
  }): Promise<PieceResult>;
};

export type PieceChannel<TAuth, TOptions, TClient> = {
  adapter(args: { auth: TAuth; options: TOptions }): Adapter;
  identity(args: {
    author: Author;
    client: TClient;
    req: FrogBotRequest;
  }): Promise<TypedUser | null>;
  questions?: PieceChannelQuestions<TClient>;
};

/** A line shown with a provider's models in the chat model picker, with an optional link. */
export type PieceProviderNotice = { text: string; link?: { label: string; url: string } };

/**
 * Links a piece to a built-in AI provider. Listing the piece in `connections` makes each user's
 * linked account the credential for their calls to `name`.
 */
export type PieceProvider<TAuth> = {
  name: ProviderName;
  /** Where a user checks their account's billing, named when the account is out of credit. */
  billingUrl?: string;
  /**
   * Provider settings for a call on a linked account, merged over `ai.providers[name]`. Throw to
   * fail the call before any request, for example on `via: 'http'`.
   */
  credential(args: { auth: TAuth; via: CallCredentialVia }): Record<string, unknown>;
  /**
   * The provider's model IDs this account can use. Throw an error with `status` 401 or 403 when
   * the provider rejects the credential; return `undefined` when the account can't list its
   * models, so the picker shows the app's usual list.
   */
  models?(args: {
    auth: TAuth;
    credential: Record<string, unknown>;
    signal: AbortSignal;
  }): Promise<string[] | undefined>;
  /** Wraps the account's language models, for providers whose calls need reshaping. */
  middleware?(args: { auth: TAuth }): CallCredentialResult['middleware'];
  /** Shown with this provider's models in the model picker for this account. */
  notice?(args: { auth: TAuth }): PieceProviderNotice | undefined;
};

export type PieceCapabilities = {
  webhook?: object;
  email?: object;
  channel?: object;
  oauth?: object;
  provider?: object;
  factoryOAuth: boolean;
  pieceOAuth: boolean;
  signIn: boolean;
  staticAuth: boolean;
};

export const pieceCapabilities = '~capabilities';

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
  oauth?: PieceOAuthRecipe<TTypes['auth'], TClient> | PieceOAuthSignIn<TTypes['auth']>;
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
      TClient,
      TTypes['triggers'][TSlug] extends { state: infer TState } ? TState : unknown
    > & { slug: TSlug };
  }[keyof TTypes['triggers'] & string][];
  webhook?: PieceWebhook<TTypes['options']>;
  email?: PieceEmail<TTypes['options'], TClient>;
  channel?: PieceChannel<TTypes['auth'], TTypes['options'], TClient>;
  provider?: PieceProvider<TTypes['auth']>;
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
  client(args: {
    req: FrogBotRequest;
    connection?: number | string;
    as?: string;
  }): Promise<unknown>;
  readonly [pieceCapabilities]: PieceCapabilities;
};

export type PieceScopeName<T> = T extends { oauth: { scopes: { catalog: infer TCatalog } } }
  ? keyof TCatalog & string
  : never;

/**
 * A piece instance's OAuth scopes, as names from the piece's catalog. A function receives the
 * defaults, `({ defaultScopes }) => [...defaultScopes, 'gmail.labels']`; an array replaces them.
 * The recipe's required scopes are always requested.
 */
export type PieceScopes<TName extends string> =
  readonly TName[] | ((args: { defaultScopes: TName[] }) => readonly TName[]);

type AnyFunction = (...args: never[]) => unknown;

export type PieceFactoryOptions<T extends PieceDefinition> = {
  slug?: string;
  auth?: T extends { provider: object }
    ? never
    : T extends { auth: infer TAuth extends z.ZodType }
      ? z.input<TAuth>
      : never;
  oauth?: T extends { oauth: { authorize: AnyFunction } }
    ? never
    : T extends { oauth: object }
      ? OAuthApp & { scopes?: never }
      : never;
  scopes?: T extends { oauth: object } ? PieceScopes<PieceScopeName<T>> : never;
} & (T extends { options: infer TOptions extends z.ZodType }
  ? z.input<TOptions> extends Record<string, never>
    ? object
    : z.input<TOptions>
  : object);

type DefinedCapability<T, K extends PropertyKey> =
  T extends Record<K, infer TValue> ? TValue : undefined;

type RequiresRequest<TConfig> = TConfig extends { auth: infer TAuth }
  ? undefined extends TAuth
    ? true
    : false
  : true;

export type DefinedPiece<T extends PieceDefinition, TConfig> = {
  slug: string;
  piece: string;
  oauth?: OAuthApp;
  client(
    args: (RequiresRequest<TConfig> extends true
      ? { req: FrogBotRequest }
      : { req?: FrogBotRequest }) & { connection?: number | string; as?: string },
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
    provider: DefinedCapability<T, 'provider'>;
    factoryOAuth: TConfig extends { oauth: OAuthApp } ? true : false;
    pieceOAuth: T extends { oauth: { authorize: AnyFunction } } ? true : false;
    staticAuth: T extends { auth: z.ZodType } ? true : false;
    signIn: TConfig extends { oauth: OAuthApp }
      ? T extends { oauth: { account: (...args: never[]) => Promise<{ email: string }> } }
        ? true
        : boolean
      : false;
  };
} & {
  [TAction in T['actions'][number] as TAction['slug']]: ((
    args: PieceCallArgs<z.input<TAction['input']>, RequiresRequest<TConfig>>,
  ) => TAction extends { output: infer TOutput extends z.ZodType }
    ? Promise<z.output<TOutput>>
    : ReturnType<TAction['run']>) &
    Tool<
      TAction['input'],
      TAction extends { output: infer TOutput extends z.ZodType }
        ? z.output<TOutput>
        : Awaited<ReturnType<TAction['run']>>
    >;
};

export type PieceFactory<T extends PieceDefinition> = <
  const TConfig extends PieceFactoryOptions<T>,
>(
  ...args: object extends PieceFactoryOptions<T> ? [config?: TConfig] : [config: TConfig]
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

export type Piece = PieceInstance;

export type PieceConfig = PieceInstance;

export type SanitizedPiecesConfig = {
  instances: PieceInstance[];
};
