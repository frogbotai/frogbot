import type { ProviderName } from '../../../packages/gateway/src/providers/registry.js';

export type TextWire = 'chat' | 'messages' | 'responses';

export type LiveRoute =
  TextWire | 'cache' | 'embeddings' | 'rerank' | 'transcriptions' | 'speech' | 'images' | 'videos';

export type LiveFeature =
  'tools' | 'vision' | 'pdf' | 'audio' | 'json' | 'reasoning' | 'thinking' | 'cache';

export type SpeechSpec = { model: string; voice: string };

export type LiveProviderEntry = {
  label: string;
  provider?: ProviderName;
  compat?: { baseURL: string; apiKeyEnv: string };
  keys: string[];
  text?: { model: string; features: LiveFeature[] };
  embeddings?: string[];
  rerank?: string[];
  transcriptions?: string[];
  speech?: SpeechSpec[];
  images?: string[];
  videos?: string[];
};

function models(label: string, route: string, fallback: string[]): string[] {
  const override = process.env[`E2E_MODEL_${label.toUpperCase()}_${route.toUpperCase()}`];

  if (!override) return fallback;

  return override
    .split(',')
    .map((model) => model.trim())
    .filter((model) => model.length > 0);
}

function text(label: string, model: string, features: LiveFeature[]): LiveProviderEntry['text'] {
  return { model: models(label, 'text', [model])[0], features };
}

function bedrockKeys(): string[] {
  if (process.env.AWS_PROFILE) return ['AWS_PROFILE'];

  if (process.env.AWS_ACCESS_KEY_ID) {
    return ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'];
  }

  return ['AWS_BEARER_TOKEN_BEDROCK'];
}

const USER_FEATURES: LiveFeature[] = ['tools', 'vision', 'pdf', 'json', 'cache'];

export const LIVE_MATRIX: LiveProviderEntry[] = [
  {
    label: 'openai',
    provider: 'openai',
    keys: ['OPENAI_API_KEY'],
    text: text('openai', 'gpt-6-luna', [...USER_FEATURES, 'reasoning']),
    embeddings: models('openai', 'embeddings', ['text-embedding-3-small']),
    transcriptions: models('openai', 'transcriptions', ['gpt-4o-mini-transcribe']),
    speech: [{ model: 'gpt-4o-mini-tts', voice: 'alloy' }],
    images: models('openai', 'images', ['gpt-image-1-mini']),
  },
  {
    label: 'anthropic',
    provider: 'anthropic',
    keys: ['ANTHROPIC_API_KEY'],
    text: text('anthropic', 'claude-sonnet-5', [...USER_FEATURES, 'thinking']),
  },
  {
    label: 'google',
    provider: 'google',
    keys: ['GOOGLE_GENERATIVE_AI_API_KEY'],
    text: text('google', 'gemini-3.8-flash', [...USER_FEATURES, 'audio', 'reasoning']),
    embeddings: models('google', 'embeddings', ['gemini-embedding-001']),
  },
  {
    label: 'fireworks',
    provider: 'fireworks',
    keys: ['FIREWORKS_API_KEY'],
    text: text('fireworks', 'accounts/fireworks/models/deepseek-v4p1-flash', [
      'tools',
      'vision',
      'json',
      'reasoning',
      'cache',
    ]),
  },
  {
    label: 'groq',
    provider: 'groq',
    keys: ['GROQ_API_KEY'],
    text: text('groq', 'openai/gpt-oss-120b', ['tools', 'json', 'reasoning', 'cache']),
    transcriptions: models('groq', 'transcriptions', ['whisper-large-v3-turbo']),
  },
  {
    label: 'mistral',
    provider: 'mistral',
    keys: ['MISTRAL_API_KEY'],
    text: text('mistral', 'mistral-medium-latest', ['tools', 'vision', 'json']),
    embeddings: models('mistral', 'embeddings', ['mistral-embed']),
  },
  {
    label: 'deepseek',
    provider: 'deepseek',
    keys: ['DEEPSEEK_API_KEY'],
    text: text('deepseek', 'deepseek-chat', ['tools', 'json', 'cache']),
  },
  {
    label: 'cohere',
    provider: 'cohere',
    keys: ['COHERE_API_KEY'],
    text: text('cohere', 'command-a-plus-05-2026', ['tools', 'json']),
    embeddings: models('cohere', 'embeddings', ['embed-v4.0']),
    rerank: models('cohere', 'rerank', ['rerank-v3.5']),
  },
  {
    label: 'voyage',
    provider: 'voyage',
    keys: ['VOYAGE_API_KEY'],
    embeddings: models('voyage', 'embeddings', ['voyage-3']),
    rerank: models('voyage', 'rerank', ['rerank-2.5']),
  },
  {
    label: 'bedrock',
    provider: 'bedrock',
    keys: bedrockKeys(),
    text: text('bedrock', 'global.anthropic.claude-sonnet-5', [...USER_FEATURES, 'thinking']),
  },
  {
    label: 'vertex',
    provider: 'vertex',
    keys: ['GOOGLE_VERTEX_PROJECT', 'GOOGLE_APPLICATION_CREDENTIALS'],
    text: text('vertex', 'gemini-3.8-flash', [...USER_FEATURES, 'reasoning']),
  },
  {
    label: 'azure',
    provider: 'azure',
    keys: ['AZURE_API_KEY', 'AZURE_RESOURCE_NAME'],
    text: text('azure', 'gpt-4o-mini', ['tools', 'vision', 'json']),
  },
  {
    label: 'replicate',
    provider: 'replicate',
    keys: ['REPLICATE_API_TOKEN'],
    images: models('replicate', 'images', ['black-forest-labs/flux-schnell']),
  },
  {
    label: 'fal',
    provider: 'fal',
    keys: ['FAL_API_KEY'],
    images: models('fal', 'images', ['fal-ai/flux/schnell']),
  },
  {
    label: 'elevenlabs',
    provider: 'elevenlabs',
    keys: ['ELEVENLABS_API_KEY'],
    speech: [{ model: 'eleven_flash_v2_5', voice: 'JBFqnCBsd6RMkjVDRZzb' }],
  },
  {
    label: 'deepgram',
    provider: 'deepgram',
    keys: ['DEEPGRAM_API_KEY'],
    transcriptions: models('deepgram', 'transcriptions', ['nova-3']),
  },
  {
    label: 'openrouter',
    provider: 'openrouter',
    keys: ['OPENROUTER_API_KEY'],
    text: text('openrouter', 'anthropic/claude-sonnet-5', ['cache']),
  },
];

function csvFilter(envVar: string): Set<string> | undefined {
  const raw = process.env[envVar];

  if (!raw) return undefined;

  return new Set(
    raw
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function selectedEntries(): LiveProviderEntry[] {
  const providers = csvFilter('E2E_PROVIDERS');

  return LIVE_MATRIX.filter((entry) => !providers || providers.has(entry.label));
}

export function routeEnabled(route: LiveRoute): boolean {
  const routes = csvFilter('E2E_ROUTES');

  return !routes || routes.has(route);
}
