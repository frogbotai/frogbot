// ─── AUTO-GENERATED — DO NOT EDIT MANUALLY ─────────────────────────────────
//
// This file will be replaced by a build-time script that parses the model
// catalog (LiteLLM or Portkey source) and generates typed model IDs per
// provider. For now it's manually derived from catalog.json.
//
// The build script will:
//   1. Fetch model catalog JSON
//   2. Extract unique providers → ProviderSlug union
//   3. Extract model IDs per provider → per-provider unions
//   4. Export the combined CatalogModelId union
//
// When regenerating, run: pnpm run generate:ai-types (TBD)

// ─── Provider Slugs ──────────────────────────────────────────────────────────

export type ProviderSlug =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'groq'
  | 'mistral'
  | 'cohere'
  | 'together'
  | 'xai'
  | 'perplexity'
  | 'voyage'
  | 'elevenlabs'
  | 'deepgram';

// ─── Model IDs by Provider ───────────────────────────────────────────────────

export type OpenAIModelId =
  | 'openai/gpt-4o'
  | 'openai/gpt-4o-mini'
  | 'openai/gpt-4-turbo'
  | 'openai/gpt-4.1'
  | 'openai/gpt-4.1-mini'
  | 'openai/gpt-4.1-nano'
  | 'openai/o1'
  | 'openai/o1-mini'
  | 'openai/o3'
  | 'openai/o3-mini'
  | 'openai/o4-mini'
  | 'openai/text-embedding-3-small'
  | 'openai/text-embedding-3-large'
  | 'openai/dall-e-3'
  | 'openai/gpt-image-1'
  | 'openai/tts-1'
  | 'openai/tts-1-hd'
  | 'openai/whisper-1';

export type AnthropicModelId =
  | 'anthropic/claude-sonnet-4-5'
  | 'anthropic/claude-haiku-4-5'
  | 'anthropic/claude-opus-4'
  | 'anthropic/claude-3-5-sonnet-20241022'
  | 'anthropic/claude-3-5-haiku-20241022';

export type GoogleModelId =
  | 'google/gemini-2.5-pro'
  | 'google/gemini-2.5-flash'
  | 'google/gemini-2.0-flash'
  | 'google/text-embedding-004'
  | 'google/imagen-3.0-generate-002';

export type GroqModelId =
  | 'groq/llama-3.3-70b-versatile'
  | 'groq/llama-3.1-8b-instant'
  | 'groq/whisper-large-v3';

export type MistralModelId =
  | 'mistral/mistral-large-latest'
  | 'mistral/mistral-small-latest'
  | 'mistral/codestral-latest'
  | 'mistral/mistral-embed';

export type CohereModelId =
  | 'cohere/command-r-plus'
  | 'cohere/command-r'
  | 'cohere/embed-english-v3.0'
  | 'cohere/embed-multilingual-v3.0'
  | 'cohere/rerank-english-v3.0'
  | 'cohere/rerank-multilingual-v3.0';

export type TogetherModelId =
  | 'together/meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo'
  | 'together/meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo';

export type XAIModelId =
  | 'xai/grok-3'
  | 'xai/grok-3-mini';

export type PerplexityModelId =
  | 'perplexity/sonar-pro'
  | 'perplexity/sonar';

export type VoyageModelId =
  | 'voyage/voyage-3'
  | 'voyage/voyage-3-lite'
  | 'voyage/voyage-code-3';

export type ElevenLabsModelId =
  | 'elevenlabs/eleven_multilingual_v2'
  | 'elevenlabs/eleven_v3';

export type DeepgramModelId =
  | 'deepgram/nova-2'
  | 'deepgram/aura';

// ─── Combined Catalog Model ID ───────────────────────────────────────────────

export type CatalogModelId =
  | OpenAIModelId
  | AnthropicModelId
  | GoogleModelId
  | GroqModelId
  | MistralModelId
  | CohereModelId
  | TogetherModelId
  | XAIModelId
  | PerplexityModelId
  | VoyageModelId
  | ElevenLabsModelId
  | DeepgramModelId;
