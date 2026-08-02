// Public surface of the `frogbot` package.
//
// Two categories of exports:
//
//   1. Runtime — the Frogbot class, singleton accessor, config builder.
//   2. Types — owned types and re-exports under FrogBot names.

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

export type { InitOptions, Logger } from './frogbot.js';
export { Frogbot } from './frogbot.js';
// Vocab alias — the `Frogbot` class instance, referred to as `FrogbotInstance`
// throughout docs/comments and test helpers.
export { buildConfig } from './config/build.js';
export { getPayloadConfig } from './config/getPayloadConfig.js';
export type { AppConnectionValue, ConnectionInfo } from './connections/api.js';
export { ConnectionError, Connections } from './connections/api.js';
export type { CredentialEncryption } from './connections/encryption.js';
export { createCredentialEncryption,CredentialCryptoError } from './connections/encryption.js';
export type { Frogbot as FrogbotInstance } from './frogbot.js';
export { getCachedFrogbot,getFrogbot } from './getFrogbot.js';
export type { GatewayHandler } from './server/gateway.js';
export { createGatewayHandler } from './server/gateway.js';
export type { ConnectionsConfig, CredentialSource, SanitizedConnectionsConfig } from './types/connections.js';
export type { FrogbotSanitizedConfig } from './types/sanitized.js';

// ---------------------------------------------------------------------------
// Owned types
// ---------------------------------------------------------------------------

export type { CatalogModelId } from './ai/generated.js';
export type {
  RootAdminConfig,
  RootAdminMetaConfig,
} from './types/admin.js';
export type {
  AgentAccess,
  AgentConfig,
  AgentGenerateOpts,
  AgentGenerateResult,
  AgentInstance,
  AgentProfile,
  AgentRegistry,
  AgentSchedule,
  AgentScheduleContext,
  AgentScheduleHandler,
  AgentScheduleTrigger,
  AgentStreamOpts,
  AgentStreamResult,
} from './types/agent.js';
export type {
  AIAccessFn,
  AIConfig,
  AIOutput,
  BaseAIOpts,
  EmbedManyOpts,
  EmbedOpts,
  GenerateImageOpts,
  GenerateSpeechOpts,
  GenerateTextOpts,
  GenerateVideoOpts,
  ModelId,
  RerankOpts,
  RouterConfig,
  StreamTextOpts,
  TranscribeOpts,
} from './types/ai.js';
export type { AuthConfig } from './types/auth.js';
export type { ManifestResponse } from './types/chat.js';
export type { Collection,CollectionConfig } from './types/collection.js';
export type { AfterErrorHook, FrogbotConfig, RootHooks } from './types/config.js';
export type { DatabaseAdapter } from './types/database.js';
export type {
  AgentSlug,
  CollectionSlug,
  FrogbotTypes,
  GeneratedTypes,
  TypedCollection,
  UntypedFrogbotTypes,
} from './types/generated.js';
export type {
  AIAfterErrorHook,
  AIAfterErrorHookArgs,
  AIAfterOperationHook,
  AIAfterOperationHookArgs,
  AIAfterUpstreamHook,
  AIAfterUpstreamHookArgs,
  AIBeforeOperationHook,
  AIBeforeOperationHookArgs,
  AIBeforeUpstreamHook,
  AIBeforeUpstreamHookArgs,
  AIHookContext,
  AIHooks,
} from './types/hooks-ai.js';
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
export type {
  CredentialType,
  Piece,
  PieceConfig,
  PieceToolsOptions,
  SanitizedPiecesConfig,
} from './types/piece.js';
export type { Plugin } from './types/plugin.js';
export type { FrogbotRequest } from './types/request.js';
export type { Tool, ToolCtx } from './types/tool.js';
export type { StopCondition, UIMessage } from 'ai';
export { isStepCount, Output,stepCountIs } from 'ai';

// ---------------------------------------------------------------------------
// Re-exports under FrogBot names
//
// Shapes inherited from Payload. Users see only the FrogBot import path;
// the underlying module name never appears in their code.
// ---------------------------------------------------------------------------

export type {
  // Collection-level admin block. Renamed for FrogBot vocabulary.
  CollectionAdminOptions as AdminConfig,
  EmailAdapter,
  ImportMap,
  KVAdapter,
  KVAdapterResult,
  KVStoreValue,
  SendEmailOptions,
  UploadConfig,
} from 'payload';

// ---------------------------------------------------------------------------
// Hook, access, endpoint, and field types (owned by frogbot)
// ---------------------------------------------------------------------------

export type {
  Access,
  AccessArgs,
  AccessResult,
  CollectionAccess,
  FieldAccess,
  FieldAccessArgs,
} from './types/access.js';
export type { Endpoint,Handler } from './types/endpoint.js';
export type { Field, FieldHook, FieldHookArgs, Validate, ValidateOptions } from './types/fields.js';
export type {
  AfterChangeHook,
  AfterDeleteHook,
  AfterForgotPasswordHook,
  AfterLoginHook,
  AfterLogoutHook,
  AfterReadHook,
  BeforeChangeHook,
  BeforeDeleteHook,
  BeforeLoginHook,
  BeforeReadHook,
  BeforeValidateHook,
  CollectionHooks,
  MeHook,
  RefreshHook,
} from './types/hooks.js';
