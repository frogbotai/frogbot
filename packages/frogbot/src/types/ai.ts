// AI-related types for FrogBot's AI configuration surface.
//
// Near-passthrough of AI SDK 7 — developers who know the AI SDK feel at home.
// FrogBot adds: typed model resolution, access control, hooks, and routers.

import type { ModelMessage, Output, StopCondition, ToolChoice, ToolSet } from 'ai';

import type { CatalogModelId } from '../ai/generated.js';
import type { FrogbotRequest } from './request.js';
import type { AIHooks, SanitizedAIHooks } from './hooks-ai.js';
import type { Tool } from './tool.js';

export type AIOutput = ReturnType<(typeof Output)[keyof typeof Output]>;

// ─── Provider Configuration ──────────────────────────────────────────────────

export type BuiltInProviderEntry = {
  apiKey: string;
};

export type BedrockProviderEntry = {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export type CustomProviderEntry = {
  type: 'openai-compatible';
  baseUrl: string;
  apiKey?: string;
  headers?: Record<string, string>;
  models: ModelConfig[];
};

export type ProviderConfig = {
  openai?: BuiltInProviderEntry;
  anthropic?: BuiltInProviderEntry;
  google?: BuiltInProviderEntry;
  bedrock?: BedrockProviderEntry;
  groq?: BuiltInProviderEntry;
  mistral?: BuiltInProviderEntry;
  cohere?: BuiltInProviderEntry;
  together?: BuiltInProviderEntry;
  fireworks?: BuiltInProviderEntry;
  deepinfra?: BuiltInProviderEntry;
  xai?: BuiltInProviderEntry;
  perplexity?: BuiltInProviderEntry;
  cerebras?: BuiltInProviderEntry;
  voyage?: BuiltInProviderEntry;
  replicate?: BuiltInProviderEntry;
  [customKey: string]: BuiltInProviderEntry | BedrockProviderEntry | CustomProviderEntry | undefined;
};

// ─── Model Configuration ─────────────────────────────────────────────────────

export type ModelMode =
  | 'chat'
  | 'embedding'
  | 'image_generation'
  | 'audio_speech'
  | 'audio_transcription'
  | 'rerank'
  | 'video_generation';

export type ModelModality = 'text' | 'image' | 'audio' | 'video' | 'file';

export type ModelConfig = {
  id: string;
  mode: ModelMode;
  name?: string;
  limit?: {
    context?: number;
    input?: number;
    output?: number;
  };
  cost?: {
    input?: number;
    output?: number;
    cache_read?: number;
  };
  modalities?: {
    input: ModelModality[];
    output: ModelModality[];
  };
  reasoning?: boolean;
  tool_call?: boolean;
  structured_output?: boolean;
  temperature?: boolean;
  status?: 'alpha' | 'beta' | 'deprecated';
};

// ─── Router Configuration ────────────────────────────────────────────────────

export type RouterConfig = {
  model: string;
  /** @notImplemented — reserved for future admin UI integration. */
  hidden?: boolean;
};

// ─── Access Control ──────────────────────────────────────────────────────────

export type AIAccessFn = (args: { req: FrogbotRequest }) => boolean | Promise<boolean>;

export type AIAccessConfig = {
  generate?: AIAccessFn;
  embed?: AIAccessFn;
  transcribe?: AIAccessFn;
  rerank?: AIAccessFn;
};

export type AIMethod =
  | 'generateText'
  | 'streamText'
  | 'embed'
  | 'embedMany'
  | 'generateImage'
  | 'generateSpeech'
  | 'transcribe'
  | 'generateVideo'
  | 'rerank';

// ─── Telemetry Configuration ─────────────────────────────────────────────────

/**
 * Span types emitted by `@ai-sdk/otel`. Matches `OpenTelemetrySpanType`
 * from `@ai-sdk/otel` without taking a hard dependency.
 */
export type AITelemetrySpanType =
  | 'operation'
  | 'step'
  | 'languageModel'
  | 'tool'
  | 'embedding'
  | 'reranking';

export type AIEnrichSpanArgs = {
  spanType: AITelemetrySpanType;
  operationId: string;
  callId: string;
  runtimeContext: Record<string, unknown> | undefined;
};

/**
 * Custom attributes added to every AI SDK span. Returned attribute values
 * are stringified by `@ai-sdk/otel` before being attached to the span.
 */
export type AIEnrichSpan = (args: AIEnrichSpanArgs) => Record<string, unknown> | undefined;

export type AITelemetryConfig = {
  /** Auto-register `@ai-sdk/otel` if available. Default: `true`. */
  enabled?: boolean;
  /** User-provided span attributes merged on top of FrogBot's defaults. */
  enrichSpan?: AIEnrichSpan;
};

// ─── Top-Level AI Config ─────────────────────────────────────────────────────

export type AIConfig = {
  providers: ProviderConfig;
  routers?: Record<string, RouterConfig>;
  defaultRouter?: string;
  hooks?: AIHooks;
  access?: AIAccessConfig;
  /** Deployment identifier attached to telemetry spans. Default: `FROGBOT_DEPLOYMENT_ID` env or `'local'`. */
  deploymentId?: string;
  telemetry?: AITelemetryConfig;
};

// ─── Sanitized AI Config ─────────────────────────────────────────────────────

export type SanitizedAITelemetryConfig = {
  enabled: boolean;
  enrichSpan?: AIEnrichSpan;
};

export type SanitizedAIConfig = {
  providers: ProviderConfig;
  routers: Record<string, RouterConfig>;
  defaultRouter?: string;
  hooks: SanitizedAIHooks;
  access: Required<AIAccessConfig>;
  telemetry: SanitizedAITelemetryConfig;
  _internal: {
    deploymentId: string;
  };
};

// ─── Model ID Type ───────────────────────────────────────────────────────────
//
// Union of catalog model IDs + router slugs. The `(string & {})` arm allows
// any string (for custom/unlisted models) while preserving autocomplete for
// known values. When the build-time generator runs, CatalogModelId will be
// a comprehensive union of every model from the configured catalog source.

export type ModelId =
  | CatalogModelId
  | (string & {});

// ─── Operation Options Types ─────────────────────────────────────────────────

export type BaseAIOpts = {
  model: ModelId;
  req?: Partial<FrogbotRequest>;
  overrideAccess?: boolean;
};

export type GenerateTextOpts = BaseAIOpts & (
  | { prompt: string; messages?: never }
  | { prompt?: never; messages: ModelMessage[] }
) & {
  instructions?: string;
  tools?: Tool[];
  toolChoice?: ToolChoice<ToolSet>;
  output?: AIOutput;
  stopWhen?: StopCondition<ToolSet> | StopCondition<ToolSet>[];
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  seed?: number;
  maxRetries?: number;
  timeout?: number;
  stopSequences?: string[];
  providerOptions?: Record<string, unknown>;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
  onStepEnd?: (event: unknown) => void | Promise<void>;
};

export type StreamTextOpts = GenerateTextOpts & {
  onFinish?: (event: unknown) => void | Promise<void>;
  onEnd?: (event: unknown) => void | Promise<void>;
  onError?: (event: { error: unknown }) => void | Promise<void>;
  onAbort?: (event: unknown) => void | Promise<void>;
};

export type EmbedOpts = BaseAIOpts & {
  value: string;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
};

export type EmbedManyOpts = BaseAIOpts & {
  values: string[];
  maxParallelCalls?: number;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
};

export type GenerateImageOpts = BaseAIOpts & {
  prompt: string;
  n?: number;
  size?: string;
  providerOptions?: Record<string, unknown>;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
};

export type GenerateSpeechOpts = BaseAIOpts & {
  text: string;
  voice?: string;
  speed?: number;
  providerOptions?: Record<string, unknown>;
  abortSignal?: AbortSignal;
};

export type TranscribeOpts = BaseAIOpts & {
  audio: Blob | ArrayBuffer | ReadableStream;
  language?: string;
  providerOptions?: Record<string, unknown>;
  abortSignal?: AbortSignal;
};

export type GenerateVideoOpts = BaseAIOpts & {
  prompt: string;
  providerOptions?: Record<string, unknown>;
  abortSignal?: AbortSignal;
};

export type RerankOpts = BaseAIOpts & {
  query: string;
  documents: string[];
  topN?: number;
  abortSignal?: AbortSignal;
};
