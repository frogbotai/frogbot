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
export { getConfiguredModelIds } from './ai/models.js';
export type { AIUserPolicy } from './ai/policy.js';
export {
  backfillAIUserPolicy,
  enforcePolicy,
  isTargetAllowed,
  resolvePolicy,
} from './ai/policy.js';
export { buildConfig } from './config/build.js';
export { getPayloadConfig } from './config/getPayloadConfig.js';
export type { AppConnectionValue, ConnectionInfo } from './connections/api.js';
export { ConnectionError, Connections } from './connections/api.js';
export type { CredentialEncryption } from './connections/encryption.js';
export { createCredentialEncryption, CredentialCryptoError } from './connections/encryption.js';
export type { Frogbot as FrogbotInstance } from './frogbot.js';
export { getCachedFrogbot, getFrogbot } from './getFrogbot.js';
export type { PersistedMessage } from './chat/messagesToUIMessages.js';
export { messagesToUIMessages } from './chat/messagesToUIMessages.js';
export type { GatewayHandler } from './server/gateway.js';
export { createGatewayHandler } from './server/gateway.js';
export type {
  ReadTrainingDataOptions,
  TrainingDataDocument,
  TrainingDataRecord,
} from './training/types.js';
export type {
  ConnectionsConfig,
  CredentialSource,
  SanitizedConnectionsConfig,
} from './connections/types.js';
export type { FrogbotSanitizedConfig } from './config/sanitized.js';

// ---------------------------------------------------------------------------
// Owned types
// ---------------------------------------------------------------------------

export type { CatalogModelId } from './ai/generated.js';
export type {
  RootAdminComponents,
  RootAdminConfig,
  RootAdminGraphics,
  RootAdminMetaConfig,
  NavItem,
} from './admin/types.js';
export type {
  AgentAccess,
  AgentConfig,
  AgentGenerateOpts,
  AgentGenerateResult,
  AgentInstance,
  AgentManifest,
  AgentManifestEntry,
  AgentModelId,
  AgentProfile,
  AgentRegistry,
  AgentSchedule,
  AgentScheduleContext,
  AgentScheduleHandler,
  AgentScheduleTrigger,
  AgentStreamOpts,
  AgentStreamResult,
} from './agents/types.js';
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
} from './ai/types.js';
export type { AuthConfig } from './auth/types.js';
export type { ManifestResponse } from './chat/types.js';
export type { Collection, CollectionAdminConfig, CollectionConfig } from './collections/config/types.js';
export type { IconName } from './admin/icons.js';
export type { AdminViews, FrogbotComponent, ProviderComponent } from './admin/types.js';
export type { AfterErrorHook, FrogbotConfig, OnInit, RootHooks } from './config/types.js';
export type { DatabaseAdapter } from './database/types.js';
export type {
  AgentSlug,
  CollectionSlug,
  FrogbotTypes,
  GeneratedTypes,
  RoleSlug,
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
} from './ai/hooks/types.js';
export type {
  AuthArgs,
  AuthResult,
  ForgotPasswordArgs,
  LoginArgs,
  LoginResult,
  ResetPasswordArgs,
  ResetPasswordResult,
  UnlockArgs,
  VerifyEmailArgs,
} from './auth/types.js';
export type {
  BulkResult,
  CountArgs,
  CreateArgs,
  DeleteArgs,
  DeleteByIDArgs,
  DeleteManyArgs,
  DocID,
  DuplicateArgs,
  FindArgs,
  FindByIDArgs,
  FindDistinctArgs,
  PaginatedDistinctDocs,
  PaginatedDocs,
  UpdateArgs,
  UpdateByIDArgs,
  UpdateManyArgs,
} from './collections/config/types.js';
export type {
  CountVersionsArgs,
  FindVersionByIDArgs,
  FindVersionsArgs,
  RestoreVersionArgs,
  TypeWithVersion,
} from './versions/types.js';
export type {
  CredentialType,
  Piece,
  PieceConfig,
  PieceToolsOptions,
  SanitizedPiecesConfig,
} from './pieces/types.js';
export type { Plugin } from './plugin.js';
export type { FrogbotRequest } from './types/request.js';
export type { SettingsEntry } from './admin/types.js';
export type { SkillConfig, SkillContent, SkillCtx, SkillResource } from './skills/types.js';
export type { Tool, ToolCtx } from './tools/types.js';
export type { StopCondition, UIMessage } from 'ai';
export { isStepCount, Output, stepCountIs } from 'ai';

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
} from './collections/config/types.js';
export type { Endpoint, Handler } from './endpoints/types.js';
export type { Field, FieldHook, FieldHookArgs, Validate, ValidateOptions } from './fields/config/types.js';
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
} from './collections/config/types.js';
