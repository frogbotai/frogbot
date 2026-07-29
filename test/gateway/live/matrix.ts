// Live matrix — which providers × routes × models the live e2e suite exercises.
//
// One table drives the whole suite (`matrix.e2e.spec.ts`). Every entry is
// key-gated: it runs only when its env var is set, so the suite lights up
// incrementally as you add keys and skips cleanly otherwise.
//
// WHERE TO PUT KEYS: the repo-root `.env` (gitignored, `export KEY=value`
// format) — the e2e project loads it automatically (see `loadEnv.ts`).
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
];
