export type ProviderSlug =
  | 'anthropic'
  | 'cohere'
  | 'deepgram'
  | 'elevenlabs'
  | 'google'
  | 'groq'
  | 'mistral'
  | 'openai'
  | 'perplexity'
  | 'togetherai'
  | 'voyage'
  | 'xai';

export type AnthropicModelId =
  | 'anthropic/claude-3-5-haiku-20241022'
  | 'anthropic/claude-3-5-sonnet-20241022'
  | 'anthropic/claude-haiku-4-5'
  | 'anthropic/claude-opus-4'
  | 'anthropic/claude-sonnet-4-5';

export type CohereModelId =
  | 'cohere/command-r'
  | 'cohere/command-r-plus'
  | 'cohere/embed-english-v3.0'
  | 'cohere/embed-multilingual-v3.0'
  | 'cohere/rerank-english-v3.0'
  | 'cohere/rerank-multilingual-v3.0';

export type DeepgramModelId =
  | 'deepgram/aura'
  | 'deepgram/nova-2';

export type ElevenlabsModelId =
  | 'elevenlabs/eleven_multilingual_v2'
  | 'elevenlabs/eleven_v3';

export type GoogleModelId =
  | 'google/gemini-2.0-flash'
  | 'google/gemini-2.5-flash'
  | 'google/gemini-2.5-pro'
  | 'google/imagen-3.0-generate-002'
  | 'google/text-embedding-004';

export type GroqModelId =
  | 'groq/llama-3.1-8b-instant'
  | 'groq/llama-3.3-70b-versatile'
  | 'groq/whisper-large-v3';

export type MistralModelId =
  | 'mistral/codestral-latest'
  | 'mistral/mistral-embed'
  | 'mistral/mistral-large-latest'
  | 'mistral/mistral-small-latest';

export type OpenAIModelId =
  | 'openai/dall-e-3'
  | 'openai/gpt-4-turbo'
  | 'openai/gpt-4.1'
  | 'openai/gpt-4.1-mini'
  | 'openai/gpt-4.1-nano'
  | 'openai/gpt-4o'
  | 'openai/gpt-4o-mini'
  | 'openai/gpt-image-1'
  | 'openai/o1'
  | 'openai/o1-mini'
  | 'openai/o3'
  | 'openai/o3-mini'
  | 'openai/o4-mini'
  | 'openai/text-embedding-3-large'
  | 'openai/text-embedding-3-small'
  | 'openai/tts-1'
  | 'openai/tts-1-hd'
  | 'openai/whisper-1';

export type PerplexityModelId =
  | 'perplexity/sonar'
  | 'perplexity/sonar-pro';

export type TogetherModelId =
  | 'togetherai/meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo'
  | 'togetherai/meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo';

export type VoyageModelId =
  | 'voyage/voyage-3'
  | 'voyage/voyage-3-lite'
  | 'voyage/voyage-code-3';

export type XAIModelId =
  | 'xai/grok-3'
  | 'xai/grok-3-mini';

export type CatalogModelId =
  | AnthropicModelId
  | CohereModelId
  | DeepgramModelId
  | ElevenlabsModelId
  | GoogleModelId
  | GroqModelId
  | MistralModelId
  | OpenAIModelId
  | PerplexityModelId
  | TogetherModelId
  | VoyageModelId
  | XAIModelId;
