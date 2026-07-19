// Provider definition: generic OpenAI-compatible endpoints.
//
// Unlike the fixed vendors in `providers/registry.ts`, openai-compatible
// providers are declared as an array of named configs in the gateway config:
//
//   {
//     openaiCompatible: [
//       { name: 'ollama',  baseURL: 'http://localhost:11434/v1' },
//       { name: 'lm-studio', baseURL: 'http://localhost:1234/v1' },
//     ]
//   }
//
// Each entry becomes a first-class provider under its declared `name`, and
// is dispatched via the usual `<name>/<model>` canonical id. Names that
// shadow a built-in provider (e.g. `openai`, `groq`) are rejected at
// config-parse time.
//
// This provider is intentionally NOT part of env auto-discovery — there's
// no reasonable way to derive a base URL from env alone, and multi-endpoint
// setups need explicit declarations.

import {
  createOpenAICompatible,
  type OpenAICompatibleProvider,
} from '@ai-sdk/openai-compatible';

/**
 * A single openai-compatible endpoint declaration. The `name` becomes the
 * canonical prefix (`<name>/<model>`) in the gateway's dispatch table.
 */
export type OpenAICompatibleConfig = {
  /** Unique provider name — becomes the `<name>/<model>` dispatch prefix. */
  name: string;
  /** Base URL of the OpenAI-compatible API (typically ending in `/v1`). */
  baseURL: string;
  /** Optional API key sent as `Authorization: Bearer <apiKey>`. */
  apiKey?: string;
  /** Optional extra request headers. */
  headers?: Record<string, string>;
  /** Optional query params appended to every request URL. */
  queryParams?: Record<string, string>;
};

/**
 * Build a single openai-compatible provider instance from a config entry.
 * Called by the registry builder — not intended for direct use.
 */
export function buildOpenAICompatibleProvider(
  cfg: OpenAICompatibleConfig,
): OpenAICompatibleProvider {
  return createOpenAICompatible({
    name: cfg.name,
    baseURL: cfg.baseURL,
    ...(cfg.apiKey !== undefined && { apiKey: cfg.apiKey }),
    ...(cfg.headers !== undefined && { headers: cfg.headers }),
    ...(cfg.queryParams !== undefined && { queryParams: cfg.queryParams }),
  });
}
