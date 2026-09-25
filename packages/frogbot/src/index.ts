// Public surface of the `frogbot` package.
//
// Two categories of exports:
//
//   1. Runtime — the FrogBot class, singleton accessor, config builder.
//   2. Types — owned types and re-exports under FrogBot names.

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

export type { InitOptions, Logger } from './frogbot.js';
export { FrogBot } from './frogbot.js';
// Vocab alias — the `FrogBot` class instance, referred to as `FrogBotInstance`
// throughout docs/comments and test helpers.
export { getConfiguredModelIds } from './ai/models.js';
export type { AIUserPolicy } from './ai/policy.js';
export {
  backfillAIUserPolicy,
  enforcePolicy,
  isTargetAllowed,
  resolvePolicy,
} from './ai/policy.js';
export type { PersistedMessage } from './chat/messagesToUIMessages.js';
export { messagesToUIMessages } from './chat/messagesToUIMessages.js';
export { buildConfig } from './config/build.js';
export type { FrogBotSanitizedConfig } from './config/sanitized.js';
export type { AuthorizationRequirement, ConnectionResolveArgs } from './connections/api.js';
export { ConnectionError, Connections } from './connections/api.js';
export type { CredentialEncryption } from './connections/encryption.js';
export { createCredentialEncryption, CredentialCryptoError } from './connections/encryption.js';
export type { ConnectionMetadata } from './connections/store.js';
export type {
  ConnectionEntry,
  ConnectionsConfig,
  SanitizedConnectionsConfig,
} from './connections/types.js';
export { slugField } from './fields/baseFields/slug/index.js';
export type { FrogBot as FrogBotInstance } from './frogbot.js';
export { getCachedFrogBot, getFrogBot } from './getFrogBot.js';
export type { GatewayHandler } from './server/gateway.js';
export { createGatewayHandler } from './server/gateway.js';
export type {
  ReadTrainingDataOptions,
  TrainingDataDocument,
  TrainingDataRecord,
} from './training/types.js';
export { chunkGenerator } from './utilities/chunkGenerator.js';

// ---------------------------------------------------------------------------
// Owned types
// ---------------------------------------------------------------------------

export type { IconName } from './admin/icons.js';
export type {
  NavItem,
  RootAdminComponents,
  RootAdminConfig,
  RootAdminGraphics,
  RootAdminMetaConfig,
} from './admin/types.js';
export type { AdminViews, FrogBotComponent, ProviderComponent } from './admin/types.js';
export type { SettingsEntry } from './admin/types.js';
export type {
  BoardView,
  CalendarMode,
  CalendarView,
  CollectionView,
  CustomView,
  ListView,
  ViewAccess,
  ViewComponents,
  ViewFilter,
  ViewPagination,
} from './admin/views/types.js';
export type {
  AgentAccess,
  AgentConfig,
  AgentGenerateOpts,
  AgentGenerateResult,
  AgentInstance,
  AgentManifest,
  AgentManifestEntry,
  AgentModelId,
  AgentPieceTrigger,
  AgentProfile,
  AgentRegistry,
  AgentSchedule,
  AgentScheduleContext,
  AgentScheduleHandler,
  AgentScheduleTrigger,
  AgentStreamMessageOpts,
  AgentStreamMessageQueuedResult,
  AgentStreamMessageResult,
  AgentStreamOpts,
  AgentStreamResult,
} from './agents/types.js';
export type { CatalogModelId } from './ai/generated.js';
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
  AIAccessFn,
  AIConfig,
  AIOutput,
  BaseAIOpts,
  EmbedManyOpts,
  EmbedOpts,
  EvaluateOpts,
  EvaluateResult,
  EvaluationQuestion,
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
export type { ChannelThreadReference } from './channels/types.js';
export type { TurnErrorCode } from './chat/turn/errors.js';
export type {
  ClientToolSettlement,
  ClientToolsOption,
  MessageDelivery,
  PendingCall,
  TurnActor,
  TurnState,
} from './chat/turn/types.js';
export type { ManifestResponse } from './chat/types.js';
export type {
  Collection,
  CollectionAdminConfig,
  CollectionConfig,
} from './collections/config/types.js';
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
  AfterErrorHook,
  FrogBotConfig,
  LivePreviewConfig,
  LivePreviewURLArgs,
  LivePreviewURLType,
  OnInit,
  RootHooks,
  RootLivePreviewConfig,
} from './config/types.js';
export type {
  AdapterSearch,
  AdapterSearchArgs,
  AdapterSearchResult,
  AdapterSearchRow,
  BuildSearchSchema,
  BuildSearchSchemaArgs,
  DatabaseAdapter,
  MapVectorField,
  MapVectorFieldArgs,
  SearchAdapter,
  SearchCapabilities,
  SearchCapabilitiesArgs,
  SearchCapability,
  SearchReadiness,
  SearchReadinessArgs,
} from './database/types.js';
export type {
  JobQueueArgs,
  Jobs,
  JobsConfig,
  WorkflowConfig,
  WorkflowHandler,
} from './jobs/types.js';
export type { DatabaseKVAdapterOptions } from './kv/adapters/DatabaseKVAdapter.js';
export { databaseKVAdapter } from './kv/adapters/DatabaseKVAdapter.js';
export { KVLeaseLostError, KVLockContentionError, KVUnsupportedError } from './kv/errors.js';
export type { KV, KVAtomicAdapter, KVLock, KVLockCallback, KVSetOptions } from './kv/types.js';
export { definePiece } from './pieces/definePiece.js';
export type { EmailPiece } from './pieces/email.js';
export type {
  ChannelPieceInstance,
  EmailPieceInstance,
  OAuthApp,
  OAuthTokens,
  Piece,
  PieceAction,
  PieceActionDefinition,
  PieceActionTypes,
  PieceAdmin,
  PieceAppTrigger,
  PieceCapabilities,
  PieceChannel,
  PieceConfig,
  PieceDefinition,
  PieceEmail,
  PieceFactory,
  PieceInstance,
  PieceJSON,
  PieceOAuthAccount,
  PieceOAuthRecipe,
  PieceOption,
  PiecePollingTrigger,
  PieceResult,
  PieceRunArgs,
  PieceTriggerDefinition,
  PieceTriggerReference,
  PieceTypes,
  PieceWebhook,
  PieceWebhookTrigger,
  SanitizedPiecesConfig,
  SecondFactor,
  SignInMethod,
} from './pieces/types.js';
export type { Plugin } from './plugin.js';
export {
  SearchCapabilityError,
  SearchFilterUnsupportedError,
  SearchReadinessError,
  SearchValidationError,
} from './search/errors.js';
export type {
  SearchCollection,
  SearchFieldPath,
  SearchFilterField,
  SearchHit,
  SearchIndexConfig,
  SearchIndexDescriptor,
  SearchIndexDescriptors,
  SearchMetric,
  SearchMode,
  SearchOptions,
  SearchQuery,
  SearchRanking,
  SearchResult,
} from './search/types.js';
export type { SkillConfig, SkillContent, SkillCtx, SkillResource } from './skills/types.js';
export type {
  ClientTool,
  ClientToolAccess,
  ClientToolConfig,
  ClientToolValidate,
  Tool,
  ToolCtx,
} from './tools/types.js';
export type { Subscription, SubscriptionEnableProps } from './triggers/subscriptions.js';
export type { IngressRegistry, TriggerEvent, TriggerSubscriber } from './triggers/types.js';
export type {
  AgentSlug,
  CollectionSlug,
  FrogBotTypes,
  GeneratedTypes,
  RoleSlug,
  TypedCollection,
  UntypedFrogBotTypes,
} from './types/generated.js';
export type { FrogBotRequest } from './types/request.js';
export type {
  CountVersionsArgs,
  FindVersionByIDArgs,
  FindVersionsArgs,
  RestoreVersionArgs,
  TypeWithVersion,
} from './versions/types.js';
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
export type { SelectType, Sort, Where } from 'payload';

// ---------------------------------------------------------------------------
// Hook, access, endpoint, and field types (owned by frogbot)
// ---------------------------------------------------------------------------

export type * from './admin/fields/types.js';
export type {
  AdminViewClientProps,
  AdminViewServerProps,
  AdminViewServerPropsOnly,
  AfterFolderListClientProps,
  AfterFolderListServerProps,
  AfterFolderListServerPropsOnly,
  AfterFolderListTableClientProps,
  AfterFolderListTableServerProps,
  AfterFolderListTableServerPropsOnly,
  AfterListClientProps,
  AfterListServerProps,
  AfterListServerPropsOnly,
  AfterListTableClientProps,
  AfterListTableServerProps,
  AfterListTableServerPropsOnly,
  BeforeDocumentControlsClientProps,
  BeforeDocumentControlsServerProps,
  BeforeDocumentControlsServerPropsOnly,
  BeforeFolderListClientProps,
  BeforeFolderListServerProps,
  BeforeFolderListServerPropsOnly,
  BeforeFolderListTableClientProps,
  BeforeFolderListTableServerProps,
  BeforeFolderListTableServerPropsOnly,
  BeforeListClientProps,
  BeforeListServerProps,
  BeforeListServerPropsOnly,
  BeforeListTableClientProps,
  BeforeListTableServerProps,
  BeforeListTableServerPropsOnly,
  DashboardConfig,
  DefaultCellComponentProps,
  DefaultServerCellComponentProps,
  DocumentSubViewTypes,
  DocumentTabClientProps,
  DocumentTabCondition,
  DocumentTabConfig,
  DocumentTabServerProps,
  DocumentTabServerPropsOnly,
  DocumentViewClientProps,
  DocumentViewServerProps,
  DocumentViewServerPropsOnly,
  EditMenuItemsClientProps,
  EditMenuItemsServerProps,
  EditMenuItemsServerPropsOnly,
  EditViewProps,
  FolderListViewClientProps,
  FolderListViewServerProps,
  FolderListViewServerPropsOnly,
  FolderListViewSlots,
  FolderListViewSlotSharedClientProps,
  InitPageResult,
  ListViewClientProps,
  ListViewServerProps,
  ListViewServerPropsOnly,
  ListViewSlots,
  ListViewSlotSharedClientProps,
  PreviewButtonClientProps,
  PreviewButtonServerProps,
  PreviewButtonServerPropsOnly,
  PublishButtonClientProps,
  PublishButtonServerProps,
  PublishButtonServerPropsOnly,
  RenderDocumentVersionsProperties,
  SaveButtonClientProps,
  SaveButtonServerProps,
  SaveButtonServerPropsOnly,
  SaveDraftButtonClientProps,
  SaveDraftButtonServerProps,
  SaveDraftButtonServerPropsOnly,
  UnpublishButtonClientProps,
  UnpublishButtonServerProps,
  UnpublishButtonServerPropsOnly,
  ViewDescriptionClientProps,
  ViewDescriptionServerProps,
  ViewDescriptionServerPropsOnly,
  ViewTypes,
  Widget,
  WidgetInstance,
  WidgetServerProps,
  WidgetWidth,
} from './admin/views/types.js';
export type {
  Access,
  AccessArgs,
  AccessResult,
  CollectionAccess,
  FieldAccess,
  FieldAccessArgs,
} from './collections/config/types.js';
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
export type { Endpoint, Handler } from './endpoints/types.js';
export type { SlugField } from './fields/baseFields/slug/index.js';
export type {
  ArrayField,
  Block,
  BlocksField,
  CheckboxField,
  CodeField,
  CollapsibleField,
  DateField,
  EmailField,
  Field,
  FieldHook,
  FieldHookArgs,
  GroupField,
  JoinField,
  JSONField,
  NamedGroupField,
  NamedTab,
  NumberField,
  Option,
  OptionObject,
  PointField,
  RadioField,
  RelationshipField,
  RichTextField,
  RowField,
  SelectField,
  Tab,
  TabAsField,
  TabsField,
  TextareaField,
  TextField,
  UIField,
  UnnamedGroupField,
  UnnamedTab,
  UploadField,
  Validate,
  ValidateOptions,
  ValueWithRelation,
  VectorField,
} from './fields/config/types.js';
export {
  fieldAffectsData,
  fieldHasMaxDepth,
  fieldHasSubFields,
  fieldIsArrayType,
  fieldIsBlockType,
  fieldIsGroupType,
  fieldIsHiddenOrDisabled,
  fieldIsID,
  fieldIsLocalized,
  fieldIsPresentationalOnly,
  fieldIsSidebar,
  fieldIsVirtual,
  fieldShouldBeLocalized,
  fieldSupportsMany,
  groupHasName,
  optionIsObject,
  optionIsValue,
  optionsAreObjects,
  tabHasName,
  valueIsValueWithRelation,
} from './fields/config/types.js';
