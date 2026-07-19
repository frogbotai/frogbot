// Model catalog — metadata about known models for discovery, validation,
// and capability checks.
//
// The catalog is NOT required for routing (any `provider/model` ID routes
// through the registry regardless of catalog membership). It exists for:
//   1. `/v1/models` endpoint — list available models with metadata.
//   2. Operation validation — reject `chat.completions` for embedding-only models.
//   3. UI / CLI display — context windows, capabilities, cost info.
//
// Catalog entries are built with `defineModelCatalog(...presets)` and the
// `presetFor` helper which provides a type-safe factory for model families.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Modality = 'text' | 'image' | 'audio' | 'video' | 'embedding';

export type ModelCapabilities = {
  /** Supports tool/function calling. */
  toolCalling?: boolean;
  /** Supports structured JSON output. */
  structuredOutput?: boolean;
  /** Supports reasoning/thinking mode. */
  reasoning?: boolean;
  /** Supports vision (image input). */
  vision?: boolean;
  /** Supports prompt caching. */
  promptCaching?: boolean;
  /** Supports streaming. */
  streaming?: boolean;
};

export type ModelContext = {
  /** Max input tokens (context window). */
  input: number;
  /** Max output tokens. */
  output: number;
};

export type Operation =
  | 'chat.completions'
  | 'responses'
  | 'embeddings'
  | 'images.generations'
  | 'audio.speech'
  | 'audio.transcriptions'
  | 'video.generations'
  | 'rerank';

export type ModelCatalogEntry = {
  /** Canonical model ID (e.g. `openai/gpt-4o`). */
  id: string;
  /** Display name. */
  name: string;
  /** ISO date string of model creation/release. */
  created?: string;
  /** Knowledge cutoff ISO date string. */
  knowledge?: string;
  /** Input/output modalities. */
  modalities: {
    input: Modality[];
    output: Modality[];
  };
  /** Supported operations for this model. */
  operations: Operation[];
  /** Feature capabilities. */
  capabilities: ModelCapabilities;
  /** Context window limits. */
  context: ModelContext;
  /** Provider IDs that can serve this model (first = preferred). */
  providers: string[];
};

export type ModelCatalog = Map<string, ModelCatalogEntry>;

// ---------------------------------------------------------------------------
// presetFor — type-safe factory for model families
// ---------------------------------------------------------------------------

/**
 * Creates a typed preset factory for a known set of model IDs. The factory
 * produces `ModelCatalogEntry` values with the given base merged with
 * per-model overrides.
 *
 * ```ts
 * const openaiPreset = presetFor<'openai/gpt-4o' | 'openai/gpt-4o-mini'>()
 * const gpt4o = openaiPreset('openai/gpt-4o', {
 *   name: 'GPT-4o',
 *   context: { input: 128000, output: 16384 },
 *   ...
 * })
 * ```
 */
export function presetFor<Ids extends string, T extends Omit<ModelCatalogEntry, 'id'> = Omit<ModelCatalogEntry, 'id'>>() {
  return (id: Ids, base: T): ModelCatalogEntry => ({
    ...base,
    id,
  });
}

// ---------------------------------------------------------------------------
// defineModelCatalog — assemble a catalog from preset entries
// ---------------------------------------------------------------------------

/**
 * Build a `ModelCatalog` (Map<id, entry>) from an array of preset entries.
 * Duplicate IDs throw at construction time.
 *
 * ```ts
 * const catalog = defineModelCatalog(gpt4o, gpt4oMini, claude4Sonnet, ...)
 * ```
 */
export function defineModelCatalog(...entries: ModelCatalogEntry[]): ModelCatalog {
  const catalog: ModelCatalog = new Map();
  for (const entry of entries) {
    if (catalog.has(entry.id)) {
      throw new Error(`Duplicate model catalog entry: "${entry.id}"`);
    }
    catalog.set(entry.id, entry);
  }
  return catalog;
}

/**
 * Check if a catalog entry supports a given operation.
 */
export function supportsOperation(entry: ModelCatalogEntry, operation: Operation): boolean {
  return entry.operations.includes(operation);
}
