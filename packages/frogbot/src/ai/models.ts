import { canonicalizeModelId, DEFAULT_MODEL_CATALOG } from '@frogbotai/gateway';

import { catalog } from './catalog.js';
import type { AIConfig, CustomProviderEntry, ModelMode, SanitizedAIConfig } from './types.js';

const SMALL_MODEL_RE = /\b(nano|flash|lite|mini|haiku|small|fast)\b/;

function providerName(model: string): string | undefined {
  const separator = model.indexOf('/');

  return separator > 0 ? model.slice(0, separator) : undefined;
}

function configuredModels(
  ai: AIConfig | SanitizedAIConfig | undefined,
): { id: string; mode: ModelMode | undefined }[] {
  if (!ai) return [];

  const modes = new Map<string, ModelMode>(catalog.map(({ id, mode }) => [id, mode]));
  const models = new Map<string, ModelMode | undefined>();

  for (const [provider, entry] of Object.entries(ai.providers)) {
    if (!entry) continue;

    const allowlist =
      (entry as CustomProviderEntry).type === 'openai-compatible'
        ? undefined
        : (entry as { models?: string[] }).models;

    const allowed =
      allowlist && new Set(allowlist.map((name) => canonicalizeModelId(`${provider}/${name}`)));

    for (const model of catalog) {
      const modelName = model.id.slice(model.id.indexOf('/') + 1);

      if (model.provider === provider && (!allowed || allowed.has(canonicalizeModelId(model.id)))) {
        models.set(`${provider}/${modelName}`, model.mode);
      }
    }

    if ((entry as CustomProviderEntry).type === 'openai-compatible') {
      for (const model of (entry as CustomProviderEntry).models) {
        const id = `${provider}/${model.id}`;

        modes.set(id, model.mode);
        models.set(id, model.mode);
      }
    }
  }

  for (const [slug, router] of Object.entries(ai.routers ?? {})) {
    models.set(slug, modes.get(router.model));
  }

  return [...models]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, mode]) => ({ id, mode }));
}

export function getConfiguredModelIds(ai: AIConfig | SanitizedAIConfig | undefined): string[] {
  return configuredModels(ai).map(({ id }) => id);
}

export function getConfiguredChatModelIds(ai: AIConfig | SanitizedAIConfig | undefined): string[] {
  return configuredModels(ai)
    .filter(({ mode }) => mode === 'chat')
    .map(({ id }) => id);
}

export function getConfiguredTranscriptionModelIds(
  ai: AIConfig | SanitizedAIConfig | undefined,
): string[] {
  return configuredModels(ai)
    .filter(({ mode }) => mode === 'audio_transcription')
    .map(({ id }) => id);
}

export function resolveSmallModel(ai: AIConfig | SanitizedAIConfig, mainModel: string): string {
  if (ai.smallModel) return ai.smallModel;
  const provider = providerName(mainModel);
  if (!provider) return mainModel;
  const now = Date.now();
  const candidates = getConfiguredModelIds(ai)
    .filter((id) => providerName(id) === provider)
    .map((id) => DEFAULT_MODEL_CATALOG.get(id))
    .filter((model) =>
      Boolean(
        model &&
        model.status !== 'deprecated' &&
        model.cost &&
        (model.operations.includes('chat.completions') || model.operations.includes('responses')),
      ),
    )
    .map((model) => {
      const entry = model!;
      const released = entry.created ? Date.parse(entry.created) : now;

      return {
        model: entry,
        cost: entry.cost!.input + entry.cost!.output,
        age: Math.max(0, (now - released) / (1000 * 60 * 60 * 24 * 30)),
        small: SMALL_MODEL_RE.test(`${entry.id} ${entry.name}`.toLowerCase()),
      };
    })
    .filter((candidate) => candidate.cost > 0 && candidate.age <= 18);

  const pick = (items: typeof candidates) => {
    const maxCost = Math.max(...items.map((item) => item.cost), 0.01);
    const maxAge = Math.max(...items.map((item) => item.age), 0.01);

    return [...items].sort(
      (a, b) =>
        (a.cost / maxCost) * 0.8 +
        (a.age / maxAge) * 0.2 -
        ((b.cost / maxCost) * 0.8 + (b.age / maxAge) * 0.2),
    )[0]?.model.id;
  };

  const small = candidates.filter((candidate) => candidate.small);

  return pick(small.length > 0 ? small : candidates) ?? mainModel;
}
