import catalogData from './catalog.json' with { type: 'json' };
import type { AIMethod, ModelMode } from './types.js';

export type CatalogEntry = {
  id: string;
  provider: string;
  mode: ModelMode;
};

const catalog: CatalogEntry[] = catalogData as CatalogEntry[];

export function getFilteredCatalog(configuredProviders: Set<string>): CatalogEntry[] {
  return catalog.filter((entry) => configuredProviders.has(entry.provider));
}

export function getAllModelIds(configuredProviders: Set<string>): string[] {
  return getFilteredCatalog(configuredProviders).map((entry) => entry.id);
}

export function isKnownModelId(id: string, configuredProviders: Set<string>): boolean {
  return catalog.some((entry) => entry.id === id && configuredProviders.has(entry.provider));
}

const modeMethods: Record<ModelMode, AIMethod> = {
  chat: 'generateText',
  image_generation: 'generateText',
  audio_speech: 'generateText',
  video_generation: 'generateText',
  embedding: 'embed',
  audio_transcription: 'transcribe',
  rerank: 'rerank',
  evaluate: 'evaluate',
};

const modeById = new Map(catalog.map((entry) => [entry.id, entry.mode]));

export function methodForModel(id: string): AIMethod {
  const mode = modeById.get(id);

  return mode ? modeMethods[mode] : 'generateText';
}

export { catalog };
