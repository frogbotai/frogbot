// Provider definition: generic OpenAI-compatible endpoints.
//
// Any key in the gateway config's `providers` map that isn't one of the
// built-in provider names is treated as a generic OpenAI-compatible endpoint.
// The map key becomes the provider name and `<name>/<model>` dispatch prefix:
//
//   {
//     providers: {
//       ollama: { baseURL: 'http://localhost:11434/v1' },
//       'lm-studio': { baseURL: 'http://localhost:1234/v1' },
//     }
//   }
//
// `baseURL` is required — it's what distinguishes a deliberate custom endpoint
// from a typo of a built-in provider name.
//
// This provider is intentionally NOT part of env auto-discovery — there's
// no reasonable way to derive a base URL from env alone, and multi-endpoint
// setups need explicit declarations.

import {
  createOpenAICompatible,
  type OpenAICompatibleProvider,
} from '@ai-sdk/openai-compatible';

/**
 * A single openai-compatible endpoint declaration. The provider name comes
 * from the `providers` map key it's declared under.
 */
export type OpenAICompatibleConfig = {
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
  name: string,
  cfg: OpenAICompatibleConfig,
): OpenAICompatibleProvider {
  return createOpenAICompatible({
    name,
    baseURL: cfg.baseURL,
    ...(cfg.apiKey !== undefined && { apiKey: cfg.apiKey }),
    ...(cfg.headers !== undefined && { headers: cfg.headers }),
    ...(cfg.queryParams !== undefined && { queryParams: cfg.queryParams }),
  });
}
