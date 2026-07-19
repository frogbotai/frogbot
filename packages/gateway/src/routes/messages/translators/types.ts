import type { CacheControl } from '../../../shared/types.js';

// ---------------------------------------------------------------------------
// Anthropic /v1/messages wire types (request + response).
//
// Structural mirror of Anthropic's public API. Discriminated unions are used
// wherever the API spec has one, so downstream translators can narrow via
// `switch` without `as` casts.
// ---------------------------------------------------------------------------

// ===========================================================================
// Request
// ===========================================================================

export type AnthropicMessagesRequest = {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  system?: AnthropicSystemParam | null;
  temperature?: number | null;
  top_p?: number | null;
  top_k?: number | null;
  stop_sequences?: string[] | null;
  stream?: boolean | null;
  service_tier?: 'auto' | 'standard_only' | null;
  metadata?: { user_id?: string | null; [key: string]: unknown } | null;
  tools?: AnthropicToolDefinition[] | null;
  tool_choice?: AnthropicToolChoice | null;
};

export type AnthropicMessage = AnthropicUserMessage | AnthropicAssistantMessage;

export type AnthropicUserMessage = {
  role: 'user';
  content: string | AnthropicUserBlock[];
};

export type AnthropicAssistantMessage = {
  role: 'assistant';
  content: string | AnthropicAssistantBlock[];
};

// -- System --

export type AnthropicSystemTextBlock = {
  type: 'text';
  text: string;
  cache_control?: CacheControl | null;
};

export type AnthropicSystemParam = string | AnthropicSystemTextBlock[];

// -- User content blocks --

export type AnthropicUserBlock =
  | AnthropicTextBlock
  | AnthropicImageBlock
  | AnthropicToolResultBlock
  | AnthropicDocumentBlock;

export type AnthropicTextBlock = {
  type: 'text';
  text: string;
  cache_control?: CacheControl | null;
};

// Image source: base64 payload or remote URL. Anthropic uses the same
// two-variant shape for `document.source` as well.
export type AnthropicMediaSource =
  | { type: 'base64'; media_type: string; data: string }
  | { type: 'url'; url: string; media_type?: string | null };

// Document sources additionally allow a `text` variant (inline text file).
export type AnthropicDocumentSource =
  | AnthropicMediaSource
  | { type: 'text'; media_type?: string | null; data: string };

export type AnthropicImageBlock = {
  type: 'image';
  source: AnthropicMediaSource;
  cache_control?: CacheControl | null;
};

export type AnthropicDocumentBlock = {
  type: 'document';
  source: AnthropicDocumentSource;
  title?: string | null;
  context?: string | null;
  citations?: { enabled: boolean } | null;
  cache_control?: CacheControl | null;
};

// tool_result.content can be a string, or an array of text/image sub-blocks.
export type AnthropicToolResultSubBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: AnthropicMediaSource };

export type AnthropicToolResultBlock = {
  type: 'tool_result';
  tool_use_id: string;
  content?: string | AnthropicToolResultSubBlock[] | null;
  is_error?: boolean | null;
  cache_control?: CacheControl | null;
};

// -- Assistant content blocks --

export type AnthropicAssistantBlock =
  | AnthropicTextBlock
  | AnthropicThinkingBlock
  | AnthropicRedactedThinkingBlock
  | AnthropicToolUseBlock;

export type AnthropicThinkingBlock = {
  type: 'thinking';
  thinking: string;
  signature?: string | null;
};

export type AnthropicRedactedThinkingBlock = {
  type: 'redacted_thinking';
  data: string;
};

export type AnthropicToolUseBlock = {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
  cache_control?: CacheControl | null;
};

// Forward-compat catch-all for block types we don't know yet.
export type AnthropicUnknownBlock = {
  type: string;
  [key: string]: unknown;
};

// -- Tools --

export type AnthropicToolDefinition = {
  name: string;
  description?: string | null;
  input_schema?: Record<string, unknown> | null;
  type?: string | null;
};

export type AnthropicToolChoice =
  | { type: 'auto' }
  | { type: 'any' }
  | { type: 'none' }
  | { type: 'tool'; name: string };

// ===========================================================================
// Response
// ===========================================================================

export type AnthropicResponse = {
  id: string;
  type: 'message';
  role: 'assistant';
  content: AnthropicResponseBlock[];
  model: string;
  stop_reason: AnthropicStopReason | null;
  stop_sequence: string | null;
  usage: AnthropicUsage;
};

export type AnthropicResponseBlock =
  | AnthropicResponseTextBlock
  | AnthropicResponseThinkingBlock
  | AnthropicResponseRedactedThinkingBlock
  | AnthropicResponseToolUseBlock;

export type AnthropicResponseTextBlock = {
  type: 'text';
  text: string;
};

export type AnthropicResponseThinkingBlock = {
  type: 'thinking';
  thinking: string;
  signature: string;
};

export type AnthropicResponseRedactedThinkingBlock = {
  type: 'redacted_thinking';
  data: string;
};

export type AnthropicResponseToolUseBlock = {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
};

export type AnthropicStopReason =
  | 'end_turn'
  | 'max_tokens'
  | 'stop_sequence'
  | 'tool_use'
  | 'refusal'
  | 'pause_turn'
  | 'model_context_window_exceeded'
  | 'compaction';

export type AnthropicUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  service_tier?: string;
  output_tokens_details?: {
    thinking_tokens: number;
  };
  cache_creation?: {
    ephemeral_5m_input_tokens: number;
    ephemeral_1h_input_tokens: number;
  };
};
