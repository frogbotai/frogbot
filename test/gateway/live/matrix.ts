import type { ProviderName } from '../../../packages/gateway/src/providers/registry.js';

export type TextWire = 'chat' | 'messages' | 'responses';

export type LiveRoute =
  TextWire | 'cache' | 'embeddings' | 'rerank' | 'transcriptions' | 'speech' | 'images' | 'videos';

export type LiveFeature = 'tools' | 'vision' | 'pdf' | 'audio' | 'json' | 'reasoning' | 'thinking';

export type SpeechSpec = { model: string; voice: string };

export type LiveProviderEntry = {
  label: string;
  provider?: ProviderName;
  compat?: { baseURL: string; apiKeyEnv: string };
  keys: string[];
  optional?: boolean;
  text?: string[];
  scenario?: { model?: string; features: LiveFeature[] };
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

// Bedrock accepts three auth styles; require whichever one is configured.
// Default (nothing set) reports the API key as the missing credential.
function bedrockKeys(): string[] {
  if (process.env.AWS_PROFILE) return ['AWS_PROFILE'];
  if (process.env.AWS_ACCESS_KEY_ID) {
    return ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'];
  }
  return ['AWS_BEARER_TOKEN_BEDROCK'];
}

const USER_FEATURES: LiveFeature[] = ['tools', 'vision', 'pdf', 'json'];

export const LIVE_MATRIX: LiveProviderEntry[] = [
  {
    label: 'openai',
    provider: 'openai',
    keys: ['OPENAI_API_KEY'],
    text: models('openai', 'text', ['gpt-5.4-mini', 'gpt-5.6-luna']),
    scenario: { model: 'gpt-5.4-mini', features: [...USER_FEATURES, 'reasoning'] },
    embeddings: models('openai', 'embeddings', ['text-embedding-3-small']),
    transcriptions: models('openai', 'transcriptions', ['gpt-4o-mini-transcribe']),
    speech: [{ model: 'gpt-4o-mini-tts', voice: 'alloy' }],
    images: models('openai', 'images', ['gpt-image-1-mini']),
  },
  {
    label: 'anthropic',
    provider: 'anthropic',
    keys: ['ANTHROPIC_API_KEY'],
    text: models('anthropic', 'text', ['claude-haiku-4-5', 'claude-sonnet-4-6']),
    scenario: { model: 'claude-sonnet-4-6', features: [...USER_FEATURES, 'thinking'] },
  },
  {
    label: 'google',
    provider: 'google',
    keys: ['GOOGLE_GENERATIVE_AI_API_KEY'],
    text: models('google', 'text', ['gemini-3.5-flash']),
    scenario: { features: [...USER_FEATURES, 'audio', 'reasoning'] },
    embeddings: models('google', 'embeddings', ['gemini-embedding-001']),
  },
  {
    label: 'fireworks',
    provider: 'fireworks',
    keys: ['FIREWORKS_API_KEY'],
    text: models('fireworks', 'text', [
      'accounts/fireworks/models/kimi-k3',
      'accounts/fireworks/models/gpt-oss-120b',
      'accounts/fireworks/models/deepseek-v4p1-flash',
    ]),
    scenario: { features: ['tools', 'vision', 'json', 'reasoning'] },
  },
  {
    label: 'groq',
    provider: 'groq',
    keys: ['GROQ_API_KEY'],
    text: models('groq', 'text', ['openai/gpt-oss-120b', 'openai/gpt-oss-20b']),
    scenario: { features: ['tools', 'json', 'reasoning'] },
    transcriptions: models('groq', 'transcriptions', ['whisper-large-v3-turbo']),
  },
  {
    label: 'mistral',
    provider: 'mistral',
    keys: ['MISTRAL_API_KEY'],
    text: models('mistral', 'text', ['mistral-medium-latest']),
    scenario: { features: ['tools', 'vision', 'json'] },
    embeddings: models('mistral', 'embeddings', ['mistral-embed']),
  },
  {
    label: 'xai',
    provider: 'xai',
    keys: ['XAI_API_KEY'],
    text: models('xai', 'text', ['grok-4.3']),
    scenario: { features: ['tools', 'vision', 'json', 'reasoning'] },
  },
  {
    label: 'deepseek',
    provider: 'deepseek',
    keys: ['DEEPSEEK_API_KEY'],
    text: models('deepseek', 'text', ['deepseek-chat']),
    scenario: { features: ['tools', 'json'] },
  },
  {
    label: 'cohere',
    provider: 'cohere',
    keys: ['COHERE_API_KEY'],
    text: models('cohere', 'text', ['command-a-03-2025']),
    scenario: { features: ['tools', 'json'] },
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
    optional: true,
    text: models('bedrock', 'text', ['global.anthropic.claude-haiku-4-5-20251001-v1:0']),
    scenario: { features: [...USER_FEATURES, 'thinking'] },
  },
  {
    label: 'vertex',
    provider: 'vertex',
    keys: ['GOOGLE_VERTEX_PROJECT', 'GOOGLE_APPLICATION_CREDENTIALS'],
    optional: true,
    text: models('vertex', 'text', ['gemini-3.5-flash']),
    scenario: { features: [...USER_FEATURES, 'reasoning'] },
  },
  {
    label: 'azure',
    provider: 'azure',
    keys: ['AZURE_API_KEY', 'AZURE_RESOURCE_NAME'],
    optional: true,
    text: models('azure', 'text', ['gpt-4o-mini']),
    scenario: { features: ['tools', 'vision', 'json'] },
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
    label: 'vercel',
    provider: 'vercel',
    envKey: 'AI_GATEWAY_API_KEY',
    tier: 'paid',
    text: models('E2E_MODEL_VERCEL_TEXT', ['anthropic/claude-sonnet-4.6', 'openai/gpt-5.4-mini']),
  },
  {
    label: 'openrouter',
    provider: 'openrouter',
    envKey: 'OPENROUTER_API_KEY',
    tier: 'paid',
    text: models('E2E_MODEL_OPENROUTER_TEXT', ['anthropic/claude-sonnet-4.6']),
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
