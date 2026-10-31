import { z } from 'zod';

import { RESOURCE } from './constants.js';

/** OpenCode `dev`'s fixed ChatGPT plan list (2026-10-31), used when `/models` fails or is empty. */
export const PLAN_FALLBACK_MODELS: readonly string[] = [
  'gpt-5.5',
  'gpt-5.6-luna',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-6-astra',
  'gpt-6-luna',
  'gpt-6-sol',
  'gpt-6.1-sol',
  'gpt-6.1-terra',
].flatMap((id) => [id, `${id}-fast`]);

const planModels = z.object({
  models: z.array(
    z.looseObject({ slug: z.string(), visibility: z.string(), supported_in_api: z.boolean() }),
  ),
});

/**
 * The models a ChatGPT plan offers: its `/models` entries listed for display and usable in the
 * API, as OpenCode keeps them. Never throws: a failed or empty listing gives the fixed list.
 */
export async function listPlanModels({
  apiKey,
  signal,
}: {
  apiKey: string;
  signal: AbortSignal;
}): Promise<string[]> {
  try {
    const response = await fetch(`${RESOURCE}/models`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal,
    });

    if (!response.ok) return [...PLAN_FALLBACK_MODELS];

    const ids = planModels
      .parse(await response.json())
      .models.filter((model) => model.visibility === 'list' && model.supported_in_api)
      .map(({ slug }) => slug);

    return ids.length ? ids : [...PLAN_FALLBACK_MODELS];
  } catch {
    return [...PLAN_FALLBACK_MODELS];
  }
}
