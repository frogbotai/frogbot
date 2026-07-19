import type { CacheControl, ProviderMetadata } from '../../../shared/types.js';

// ---------------------------------------------------------------------------
// OpenAI wire types (request) — mirrors the OpenAI /v1/chat/completions schema
// ---------------------------------------------------------------------------

export type OpenAIChatRequest = {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  top_k?: number;
  top_p?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
  n?: number;
  stream?: boolean;
  tools?: OpenAITool[];
  tool_choice?: 'none' | 'auto' | 'required' | { type: 'function'; function: { name: string } };
  response_format?: { type: 'text' | 'json_object' };
  seed?: number;
  user?: string;
  parallel_tool_calls?: boolean;
  logit_bias?: Record<string, number>;
  logprobs?: boolean;
};

export type OpenAIMessage =
  | OpenAISystemMessage
  | OpenAIUserMessage
  | OpenAIAssistantMessage
  | OpenAIToolMessage;

export type OpenAIUnknownMessage = {
  role: string;
  [key: string]: unknown;
};

export type OpenAISystemMessage = {
  role: 'system' | 'developer';
  content: string | OpenAIContentPartText[];
  name?: string | null;
  cache_control?: CacheControl;
};

export type OpenAIUserMessage = {
  role: 'user';
  content: string | OpenAIContentPart[];
  name?: string | null;
  cache_control?: CacheControl;
};

export type OpenAIContentPartUnknown = { type: string; [key: string]: unknown };

export type OpenAIContentPart =
  | OpenAIContentPartText
  | OpenAIContentPartImage
  | OpenAIContentPartInputAudio
  | OpenAIContentPartFile;

export type OpenAIContentPartText = { type: 'text'; text: string; cache_control?: CacheControl };
export type OpenAIContentPartImage = { type: 'image_url'; image_url: { url: string; detail?: string | null }; cache_control?: CacheControl };
export type OpenAIContentPartInputAudio = {
  type: 'input_audio';
  input_audio: { data: string; format: string };
  cache_control?: CacheControl;
};
export type OpenAIContentPartFile = { type: 'file'; file: { filename?: string; file_data?: string; file_id?: string }; cache_control?: CacheControl };

export type OpenAIReasoningDetail =
  | { type: 'reasoning.text'; id?: string; index: number; text: string; signature?: string; format?: string }
  | { type: 'reasoning.encrypted'; id?: string; index: number; data: string; format?: string };

export type OpenAIAssistantMessage = {
  role: 'assistant';
  content?: string | OpenAIContentPartText[] | null;
  reasoning_content?: string;
  reasoning_details?: OpenAIReasoningDetail[];
  tool_calls?: OpenAIToolCall[];
  refusal?: string | null;
  name?: string | null;
  cache_control?: CacheControl;
  extra_content?: ProviderMetadata;
};

export type OpenAIToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export type OpenAIToolMessage = {
  role: 'tool';
  content: string | OpenAIContentPartText[];
  tool_call_id: string;
};

export type OpenAITool = {
  type: string;
  function?: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
    strict?: boolean;
  };
};

// ---------------------------------------------------------------------------
// OpenAI wire types (response)
// ---------------------------------------------------------------------------

export type OpenAIChatResponse = {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage: OpenAIUsage;
  service_tier?: string;
};

export type OpenAIChoice = {
  index: number;
  message: {
    role: 'assistant';
    content: string | null;
    tool_calls?: OpenAIToolCall[];
    refusal?: string | null;
  };
  finish_reason: string;
};

export type OpenAIUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
    cache_write_tokens?: number;
  };
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
};
