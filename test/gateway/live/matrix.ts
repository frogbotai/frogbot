// Live matrix — which providers × routes × models the live e2e suite exercises.
//
// One table drives the whole suite (`matrix.e2e.spec.ts`). Every entry is
// key-gated: it runs only when its env var is set, so the suite lights up
// incrementally as you add keys and skips cleanly otherwise.
//
// WHERE TO PUT KEYS: the repo-root `.env` (gitignored, `export KEY=value`
// format) — the e2e project loads it automatically (see `loadEnv.ts`).
//
// Free-tier signup map (no card unless noted; verified 2026-07):
//   zen        — none needed (falls back to apiKey "public")
//   groq       — console.groq.com          → GROQ_API_KEY        (chat + whisper STT + playai TTS)
//   google     — ai.google.dev             → GOOGLE_GENERATIVE_AI_API_KEY (chat + embeddings)
//   openrouter — openrouter.ai             → OPENROUTER_API_KEY  (20+ free ":free" chat models)
//   cerebras   — cloud.cerebras.ai         → CEREBRAS_API_KEY    (chat; catalog churns)
//   mistral    — console.mistral.ai        → MISTRAL_API_KEY     (chat + embeddings; phone verify)
//   cohere     — dashboard.cohere.com      → COHERE_API_KEY      (chat + embeddings + rerank; trial never expires)
//   voyage     — dash.voyageai.com         → VOYAGE_API_KEY      (embeddings + rerank; 200M free tokens)
//   togetherai — api.together.ai           → TOGETHER_API_KEY    (FLUX.1-schnell-Free images + free chat)
//   deepgram   — console.deepgram.com      → DEEPGRAM_API_KEY    ($200 signup credit, no expiry — STT)
//   elevenlabs — elevenlabs.io             → ELEVENLABS_API_KEY  (10k credits/mo — TTS)
// Paid (opt-in by setting the key):
//   openai     — OPENAI_API_KEY     native wire for /v1/chat/completions + /v1/responses ($5 min)
//   anthropic  — ANTHROPIC_API_KEY  native wire for /v1/messages ($5 min)
//   deepseek   — DEEPSEEK_API_KEY   ~$0.28/M input; deepseek-reasoner stresses reasoning translation
//   fireworks  — FIREWORKS_API_KEY  ~$1 trial credit; llama chat + FLUX images
//   fal        — FAL_API_KEY        images/videos at cents each; videos also need E2E_VIDEOS=1
//
// Model IDs churn (free catalogs especially). Every list is overridable via
// env: E2E_MODEL_<LABEL>_<ROUTE> as a comma-separated list
// (e.g. E2E_MODEL_GROQ_TEXT=llama-3.1-8b-instant,qwen3-32b).

import type { ProviderName } from '../../../packages/gateway/src/providers/registry.js';

export type TextWire = 'chat' | 'messages' | 'responses';

export type LiveRoute =
  | TextWire
  | 'embeddings'
  | 'rerank'
  | 'transcriptions'
  | 'speech'
  | 'images'
  | 'videos';

export type SpeechSpec = { model: string; voice: string };

export type LiveProviderEntry = {
  /** Model-prefix label used in requests (`<label>/<model>`). */
  label: string;
  /** First-party registry key. Mutually exclusive with `compat`. */
  provider?: ProviderName;
  /** OpenAI-compatible upstream registered under `label`. */
  compat?: { baseURL: string; apiKeyEnv?: string; apiKeyFallback?: string };
  /** Env var that gates this entry (undefined = always available). */
  envKey?: string;
  tier: 'free' | 'paid';
  /** Models run through ALL THREE text wires (chat/messages/responses), non-stream + stream. */
  text?: string[];
  /**
   * Deep-scenario tuning (scenarios.e2e.spec.ts). `model` defaults to
   * `text[0]`; set `tools: false` for models that can't call tools.
   */
  scenario?: { model?: string; tools?: boolean };
  embeddings?: string[];
  rerank?: string[];
  transcriptions?: string[];
  speech?: SpeechSpec[];
  images?: string[];
  /** Paid-only; additionally gated by E2E_VIDEOS=1. */
  videos?: string[];
};

function models(envVar: string, fallback: string[]): string[] {
  const override = process.env[envVar];
  if (!override) {
    return fallback;
  }
  return override
    .split(',')
    .map((m) => m.trim())
    .filter((m) => m.length > 0);
}

export const LIVE_MATRIX: LiveProviderEntry[] = [
  {
    label: 'zen',
    compat: {
      baseURL: 'https://opencode.ai/zen/v1',
      apiKeyEnv: 'OPENCODE_API_KEY',
      apiKeyFallback: 'public',
    },
    tier: 'free',
    text: models('E2E_MODEL_ZEN_TEXT', [
      'deepseek-v4-flash-free',
      'nemotron-3-ultra-free',
      'big-pickle',
    ]),
  },
  {
    label: 'groq',
    provider: 'groq',
    envKey: 'GROQ_API_KEY',
    tier: 'free',
    text: models('E2E_MODEL_GROQ_TEXT', [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'openai/gpt-oss-20b',
    ]),
    transcriptions: models('E2E_MODEL_GROQ_TRANSCRIPTIONS', ['whisper-large-v3-turbo']),
    speech: [{ model: models('E2E_MODEL_GROQ_SPEECH', ['playai-tts'])[0], voice: 'Fritz-PlayAI' }],
  },
  {
    label: 'google',
    provider: 'google',
    envKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
    tier: 'free',
    text: models('E2E_MODEL_GOOGLE_TEXT', ['gemini-2.5-flash', 'gemini-2.5-flash-lite']),
    embeddings: models('E2E_MODEL_GOOGLE_EMBEDDINGS', ['gemini-embedding-001']),
  },
  {
    label: 'openrouter',
    compat: {
      baseURL: 'https://openrouter.ai/api/v1',
      apiKeyEnv: 'OPENROUTER_API_KEY',
    },
    envKey: 'OPENROUTER_API_KEY',
    tier: 'free',
    text: models('E2E_MODEL_OPENROUTER_TEXT', [
      'meta-llama/llama-3.3-70b-instruct:free',
      'deepseek/deepseek-r1:free',
      'qwen/qwen3-coder:free',
    ]),
  },
  {
    label: 'cerebras',
    provider: 'cerebras',
    envKey: 'CEREBRAS_API_KEY',
    tier: 'free',
    text: models('E2E_MODEL_CEREBRAS_TEXT', ['gpt-oss-120b', 'zai-glm-4.7']),
  },
  {
    label: 'mistral',
    provider: 'mistral',
    envKey: 'MISTRAL_API_KEY',
    tier: 'free',
    text: models('E2E_MODEL_MISTRAL_TEXT', ['mistral-small-latest', 'open-mistral-nemo']),
    embeddings: models('E2E_MODEL_MISTRAL_EMBEDDINGS', ['mistral-embed']),
  },
  {
    label: 'cohere',
    provider: 'cohere',
    envKey: 'COHERE_API_KEY',
    tier: 'free',
    text: models('E2E_MODEL_COHERE_TEXT', ['command-r7b-12-2024']),
    embeddings: models('E2E_MODEL_COHERE_EMBEDDINGS', ['embed-v4.0']),
    rerank: models('E2E_MODEL_COHERE_RERANK', ['rerank-v3.5']),
  },
  {
    label: 'voyage',
    provider: 'voyage',
    envKey: 'VOYAGE_API_KEY',
    tier: 'free',
    embeddings: models('E2E_MODEL_VOYAGE_EMBEDDINGS', ['voyage-4-lite']),
    rerank: models('E2E_MODEL_VOYAGE_RERANK', ['rerank-2.5-lite']),
  },
  {
    label: 'togetherai',
    provider: 'togetherai',
    envKey: 'TOGETHER_API_KEY',
    tier: 'free',
    text: models('E2E_MODEL_TOGETHERAI_TEXT', [
      'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
      'deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free',
    ]),
    images: models('E2E_MODEL_TOGETHERAI_IMAGES', ['black-forest-labs/FLUX.1-schnell-Free']),
  },
  {
    label: 'deepgram',
    provider: 'deepgram',
    envKey: 'DEEPGRAM_API_KEY',
    tier: 'free',
    transcriptions: models('E2E_MODEL_DEEPGRAM_TRANSCRIPTIONS', ['nova-3']),
  },
  {
    label: 'elevenlabs',
    provider: 'elevenlabs',
    envKey: 'ELEVENLABS_API_KEY',
    tier: 'free',
    speech: [
      {
        model: models('E2E_MODEL_ELEVENLABS_SPEECH', ['eleven_flash_v2_5'])[0],
        voice: process.env.E2E_ELEVENLABS_VOICE ?? '21m00Tcm4TlvDq8ikWAM', // Rachel
      },
    ],
  },
  {
    label: 'openai',
    provider: 'openai',
    envKey: 'OPENAI_API_KEY',
    tier: 'paid',
    text: models('E2E_MODEL_OPENAI_TEXT', ['gpt-5-nano']),
    embeddings: models('E2E_MODEL_OPENAI_EMBEDDINGS', ['text-embedding-3-small']),
    transcriptions: models('E2E_MODEL_OPENAI_TRANSCRIPTIONS', ['whisper-1']),
    speech: [{ model: models('E2E_MODEL_OPENAI_SPEECH', ['gpt-4o-mini-tts'])[0], voice: 'alloy' }],
    images: models('E2E_MODEL_OPENAI_IMAGES', ['gpt-image-1']),
  },
  {
    label: 'anthropic',
    provider: 'anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    tier: 'paid',
    text: models('E2E_MODEL_ANTHROPIC_TEXT', ['claude-haiku-4-5']),
  },
  {
    // Not free, but nearly: ~$0.28/M input. `deepseek-reasoner` emits
    // reasoning content — great for stressing thinking/reasoning translation.
    label: 'deepseek',
    provider: 'deepseek',
    envKey: 'DEEPSEEK_API_KEY',
    tier: 'paid',
    text: models('E2E_MODEL_DEEPSEEK_TEXT', ['deepseek-chat', 'deepseek-reasoner']),
  },
  {
    // ~$1 trial credit at signup; pennies after.
    label: 'fireworks',
    provider: 'fireworks',
    envKey: 'FIREWORKS_API_KEY',
    tier: 'paid',
    text: models('E2E_MODEL_FIREWORKS_TEXT', [
      'accounts/fireworks/models/gpt-oss-120b',
    ]),
    images: models('E2E_MODEL_FIREWORKS_IMAGES', [
      'accounts/fireworks/models/flux-1-schnell-fp8',
    ]),
  },
  {
    label: 'fal',
    provider: 'fal',
    envKey: 'FAL_API_KEY',
    tier: 'paid',
    images: models('E2E_MODEL_FAL_IMAGES', ['fal-ai/flux/schnell']),
    videos: models('E2E_MODEL_FAL_VIDEOS', ['fal-ai/ltx-video']),
  },
];
