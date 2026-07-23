import type { CatalogModelId } from '../ai/generated.js';

// FrogBot's generated-types contract.
//
// `GeneratedTypes` is the augmentation point for the generated Config,
// including collections and FrogBot-specific domains such as agents.
//
// Pre-codegen, `UntypedFrogbotTypes` provides permissive fallbacks.

/** Minimum shape every stored document satisfies. */
export type TypeWithID = {
  id: string | number;
};

/** Permissive fallback. Used when no augmentation is present. */
export interface UntypedFrogbotTypes {
  agents: {
    [slug: string]: unknown;
  };
  collections: {
    [slug: string]: Record<string, unknown> & TypeWithID;
  };
  models: CatalogModelId;
}

/**
 * Augmentation point populated by the generated `frogbot-types.ts` file.
 */
export interface GeneratedTypes {} // eslint-disable-line @typescript-eslint/no-empty-object-type

type IsAugmented = keyof GeneratedTypes extends never ? false : true;

/**
 * Resolved types. Augmented config takes precedence; missing top-level
 * keys fall back to the untyped defaults so partial augmentation works.
 */
export type FrogbotTypes = IsAugmented extends true
  ? GeneratedTypes & Omit<UntypedFrogbotTypes, keyof GeneratedTypes>
  : UntypedFrogbotTypes;

/** Union of every registered collection slug. */
export type CollectionSlug = Extract<keyof FrogbotTypes['collections'], string>;

/** Union of every registered agent slug. */
export type AgentSlug = Extract<keyof FrogbotTypes['agents'], string>;

/** Document shape for a given collection slug. */
export type TypedCollection<TSlug extends CollectionSlug> =
  FrogbotTypes['collections'][TSlug];
