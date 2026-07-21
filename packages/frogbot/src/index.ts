// Public surface of the `frogbot` package.
//
// Two categories of exports:
//
//   1. Runtime — the Frogbot class, singleton accessor, config builder.
//   2. Types — owned types and re-exports under FrogBot names.
//
// HTTP/server concerns live in the `frogbot/server` subpath export.

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

export { Frogbot } from './frogbot.js';
export type { InitOptions, Logger } from './frogbot.js';
// Vocab alias — the `Frogbot` class instance, referred to as `FrogbotInstance`
// throughout docs/comments and test helpers.
export type { Frogbot as FrogbotInstance } from './frogbot.js';
export { getFrogbot, getCachedFrogbot } from './getFrogbot.js';
export { buildConfig } from './config/build.js';
export { getPayloadConfig } from './config/getPayloadConfig.js';
export { createGatewayHandler } from './server/gateway.js';
export type { GatewayHandler } from './server/gateway.js';
export type { FrogbotSanitizedConfig } from './types/sanitized.js';

// ---------------------------------------------------------------------------
// Owned types
// ---------------------------------------------------------------------------

export type { FrogbotConfig } from './types/config.js';
export type {
  AIConfig,
  ModelId,
  BaseAIOpts,
  GenerateTextOpts,
  StreamTextOpts,
  EmbedOpts,
  EmbedManyOpts,
  GenerateImageOpts,
  GenerateSpeechOpts,
  TranscribeOpts,
  GenerateVideoOpts,
  RerankOpts,
  AIAccessFn,
  AIOutput,
  RouterConfig,
} from './types/ai.js';
export type {
  AIHookContext,
  AIHooks,
  AIBeforeOperationHookArgs,
  AIBeforeOperationHook,
  AIBeforeUpstreamHookArgs,
  AIBeforeUpstreamHook,
  AIAfterUpstreamHookArgs,
  AIAfterUpstreamHook,
  AIAfterErrorHookArgs,
  AIAfterErrorHook,
  AIAfterOperationHookArgs,
  AIAfterOperationHook,
} from './types/hooks-ai.js';
export type { CatalogModelId } from './ai/generated.js';
export type { Tool, ToolCtx } from './types/tool.js';
export type {
  AgentConfig,
  AgentAccess,
  AgentGenerateOpts,
  AgentStreamOpts,
  AgentGenerateResult,
  AgentStreamResult,
  AgentInstance,
  AgentRegistry,
} from './types/agent.js';
export { isStepCount, stepCountIs, Output } from 'ai';
export type { StopCondition, UIMessage } from 'ai';
export type {
  RootAdminConfig,
  RootAdminMetaConfig,
} from './types/admin.js';
export type { CollectionConfig, Collection } from './types/collection.js';
export type {
  GeneratedTypes,
  UntypedFrogbotTypes,
  FrogbotTypes,
  AgentSlug,
  CollectionSlug,
  TypedCollection,
} from './types/generated.js';
export type {
  AuthArgs,
  AuthResult,
  BulkResult,
  CountArgs,
  CountVersionsArgs,
  CreateArgs,
  DeleteArgs,
  DeleteByIDArgs,
  DeleteManyArgs,
  DocID,
  DuplicateArgs,
  FindArgs,
  FindByIDArgs,
  FindDistinctArgs,
  FindVersionByIDArgs,
  FindVersionsArgs,
  ForgotPasswordArgs,
  LoginArgs,
  LoginResult,
  PaginatedDistinctDocs,
  PaginatedDocs,
  ResetPasswordArgs,
  ResetPasswordResult,
  RestoreVersionArgs,
  TypeWithVersion,
  UnlockArgs,
  UpdateArgs,
  UpdateByIDArgs,
  UpdateManyArgs,
  VerifyEmailArgs,
} from './types/operations.js';
export type { AuthConfig } from './types/auth.js';
export type { FrogbotRequest } from './types/request.js';
export type { Plugin } from './types/plugin.js';
export type { DatabaseAdapter } from './types/database.js';

// ---------------------------------------------------------------------------
// Re-exports under FrogBot names
//
// Shapes inherited from Payload. Users see only the FrogBot import path;
// the underlying module name never appears in their code.
// ---------------------------------------------------------------------------

export type {
  KVAdapter,
  KVAdapterResult,
  KVStoreValue,
  SendEmailOptions,
  EmailAdapter,
  UploadConfig,
  // Collection-level admin block. Renamed for FrogBot vocabulary.
  CollectionAdminOptions as AdminConfig,
} from 'payload';

// ---------------------------------------------------------------------------
// Hook, access, endpoint, and field types (owned by frogbot)
// ---------------------------------------------------------------------------

export type {
  BeforeValidateHook,
  BeforeChangeHook,
  AfterChangeHook,
  BeforeReadHook,
  AfterReadHook,
  BeforeDeleteHook,
  AfterDeleteHook,
  BeforeLoginHook,
  AfterLoginHook,
  AfterLogoutHook,
  AfterForgotPasswordHook,
  RefreshHook,
  MeHook,
  CollectionHooks,
} from './types/hooks.js';

export type {
  Access,
  AccessArgs,
  AccessResult,
  CollectionAccess,
  FieldAccess,
  FieldAccessArgs,
} from './types/access.js';

export type { Handler, Endpoint } from './types/endpoint.js';

export type { Field, FieldHook, FieldHookArgs, Validate, ValidateOptions } from './types/fields.js';
