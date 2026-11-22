import { createHash, randomUUID } from 'node:crypto';

import type { ModelId } from '../../ai/types.js';
import { memoryTokens, PINNED_TOKEN_BUDGET } from '../budget.js';
import { MemoryAdapterError } from '../errors.js';
import type { Memory, MemoryAdapter, MemoryOptions, MemoryTarget } from '../types.js';
import { canIndexMemories, MEMORIES_SLUG, memoriesCollection } from './collection.js';
import {
  memoryFingerprint,
  memorySimilarity,
  NEAR_DUPLICATE_SIMILARITY,
  normalizeMemoryText,
} from './dedupe.js';
import { searchMemoryFallback, searchMemoryIndex } from './search.js';
import {
  findMemories,
  findMemory,
  findOwnedMemory,
  inBucket,
  memoryBucket,
  type MemoryDoc,
  payloadOf,
  toMemory,
  toMemoryDoc,
} from './store.js';

export const DEFAULT_MAX_PER_SCOPE = 10_000;

const DUPLICATE_CANDIDATES = 10;

export type DatabaseMemoryOptions = MemoryOptions & {
  /** Most memories one scope may hold; a save past it fails with `limit`. Defaults to 10,000. */
  maxPerScope?: number;
  /** MongoDB only: search with Atlas Search indexes. Without it, MongoDB search is a substring match. */
  atlasSearch?: boolean;
} & (
    | { embeddingModel?: undefined; dimensions?: undefined }
    | {
        /** Adds meaning search. Nothing picks a model by default. */
        embeddingModel: ModelId;
        /** The model's vector size, such as 1536 for `text-embedding-3-small`. */
        dimensions: number;
      }
  );

type MemoryChanges = { text?: string; key?: string | null; pinned?: boolean };

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function checkOptions(options: DatabaseMemoryOptions): void {
  if (options.maxPerScope !== undefined && !isPositiveInteger(options.maxPerScope)) {
    throw new Error('[frogbot] databaseMemory: `maxPerScope` must be a positive whole number');
  }

  if (options.embeddingModel === undefined) {
    if (options.dimensions !== undefined) {
      throw new Error('[frogbot] databaseMemory: `dimensions` needs `embeddingModel`');
    }

    return;
  }

  if (typeof options.embeddingModel !== 'string' || !options.embeddingModel) {
    throw new Error('[frogbot] databaseMemory: `embeddingModel` must be a model ID');
  }

  if (!isPositiveInteger(options.dimensions)) {
    throw new Error(
      '[frogbot] databaseMemory: `dimensions` must be the embedding size, such as 1536',
    );
  }
}

function keySlot({ namespace, scopeId }: MemoryTarget, key: string): string {
  return `key:${createHash('sha256')
    .update(JSON.stringify([namespace, scopeId, key]))
    .digest('hex')}`;
}

function slotFor(target: MemoryTarget, key: string | null | undefined): string {
  return key ? keySlot(target, key) : `id:${randomUUID()}`;
}

/** Stores memories in a hidden collection of the app's own database. */
export function databaseMemory(options: DatabaseMemoryOptions = {}): MemoryAdapter {
  checkOptions(options);

  const {
    atlasSearch = false,
    dimensions,
    embeddingModel,
    maxPerScope = DEFAULT_MAX_PER_SCOPE,
    ...memoryOptions
  } = options;

  const indexed = (target: MemoryTarget) =>
    canIndexMemories({ atlasSearch, db: payloadOf(target).payload.db });

  async function embed(target: MemoryTarget, text: string): Promise<number[] | undefined> {
    if (!embeddingModel || !indexed(target)) return undefined;

    try {
      const { embedding } = await target.req.frogbot.embed({
        model: embeddingModel,
        value: text,
        req: target.req,
        overrideAccess: true,
      });

      return embedding;
    } catch (error) {
      throw new MemoryAdapterError(
        'unavailable',
        `Embedding model '${embeddingModel}' failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  async function textData(target: MemoryTarget, text: string) {
    const embedding = await embed(target, text);

    return { text, fingerprint: memoryFingerprint(text), ...(embedding ? { embedding } : {}) };
  }

  async function checkPinned(target: MemoryTarget, text: string, except?: MemoryDoc['id']) {
    const { docs } = await findMemories({
      target,
      where: {
        pinned: { equals: true },
        ...(except === undefined ? {} : { id: { not_equals: except } }),
      },
      pagination: false,
    });

    const total = docs.reduce((sum, doc) => sum + memoryTokens(doc.text), memoryTokens(text));

    if (total > PINNED_TOKEN_BUDGET) {
      throw new MemoryAdapterError(
        'limit',
        `Pinned memories in scope '${target.scope}' would use about ${total} tokens; the budget is ${PINNED_TOKEN_BUDGET}.`,
      );
    }
  }

  async function checkCap(target: MemoryTarget) {
    const { payload, req } = payloadOf(target);

    const { totalDocs } = await payload.count({
      collection: MEMORIES_SLUG,
      where: inBucket(target),
      overrideAccess: true,
      req,
    });

    if (totalDocs >= maxPerScope) {
      throw new MemoryAdapterError(
        'limit',
        `Scope '${target.scope}' already holds ${maxPerScope} memories.`,
      );
    }
  }

  async function findDuplicate(target: MemoryTarget, text: string) {
    if (!normalizeMemoryText(text)) return undefined;

    const exact = await findMemory(target, { fingerprint: { equals: memoryFingerprint(text) } });

    if (exact) return exact;

    const candidates = indexed(target)
      ? (await searchMemoryIndex({ target, query: text, limit: DUPLICATE_CANDIDATES })).map(
          ({ doc }) => doc,
        )
      : (await findMemories({ target, pagination: false, limit: maxPerScope })).docs;

    let best: { doc: MemoryDoc; similarity: number } | undefined;

    for (const doc of candidates) {
      const similarity = memorySimilarity(text, doc.text);

      if (similarity >= NEAR_DUPLICATE_SIMILARITY && similarity > (best?.similarity ?? 0)) {
        best = { doc, similarity };
      }
    }

    return best?.doc;
  }

  async function change(
    target: MemoryTarget,
    doc: MemoryDoc,
    { key, pinned, text }: MemoryChanges,
  ): Promise<Memory> {
    const pinnedAfter = pinned ?? doc.pinned === true;
    const textAfter = text ?? doc.text;

    if (pinnedAfter && (doc.pinned !== true || textAfter !== doc.text)) {
      await checkPinned(target, textAfter, doc.id);
    }

    const keyChanged = key !== undefined && (key ?? undefined) !== (doc.key ?? undefined);

    if (keyChanged && key) {
      const taken = await findMemory(target, { slot: { equals: keySlot(target, key) } });

      if (taken && String(taken.id) !== String(doc.id)) {
        throw new MemoryAdapterError(
          'invalid',
          `Another memory in scope '${target.scope}' already has key '${key}'.`,
        );
      }
    }

    const data = {
      ...(text !== undefined && text !== doc.text ? await textData(target, text) : {}),
      ...(pinned !== undefined ? { pinned } : {}),
      ...(keyChanged ? { key: key ?? null, slot: slotFor(target, key) } : {}),
    };

    const { payload, req } = payloadOf(target);

    const updated = await payload.update({
      collection: MEMORIES_SLUG,
      id: doc.id,
      data,
      depth: 0,
      overrideAccess: true,
      req,
    });

    return toMemory(toMemoryDoc(updated));
  }

  return {
    ...memoryOptions,
    collection: ({ db }) =>
      memoriesCollection({ dimensions, indexed: canIndexMemories({ atlasSearch, db }) }),
    async save(target) {
      const { key, pinned, text } = target;
      const changes = { text, ...(pinned !== undefined ? { pinned } : {}) };
      const slot = slotFor(target, key);

      const existing = key
        ? await findMemory(target, { slot: { equals: slot } })
        : await findDuplicate(target, text);

      if (existing) return change(target, existing, changes);

      if (pinned) await checkPinned(target, text);

      await checkCap(target);

      const { payload, req } = payloadOf(target);

      const data = {
        bucket: memoryBucket(target),
        scope: target.scope,
        key: key ?? null,
        slot,
        pinned: pinned ?? false,
        ...(await textData(target, text)),
      };

      try {
        const created = await payload.create({
          collection: MEMORIES_SLUG,
          data,
          depth: 0,
          overrideAccess: true,
          req,
        });

        return toMemory(toMemoryDoc(created));
      } catch (error) {
        const raced = key ? await findMemory(target, { slot: { equals: slot } }) : undefined;

        if (!raced) throw error;

        return change(target, raced, changes);
      }
    },
    async search(target) {
      const { limit, query } = target;

      if (!indexed(target)) return searchMemoryFallback({ target, query, limit });

      const hits = await searchMemoryIndex({
        target,
        query,
        limit,
        vector: await embed(target, query),
      });

      return hits.map(({ doc, score }) => ({ memory: toMemory(doc), score }));
    },
    async list(target) {
      const { docs, hasNextPage } = await findMemories({
        target,
        where: target.pinned === undefined ? undefined : { pinned: { equals: target.pinned } },
        limit: target.limit,
        page: target.page,
        sort: '-createdAt',
      });

      return { docs: docs.map(toMemory), hasNextPage };
    },
    async get(target) {
      return toMemory(await findOwnedMemory(target, target.id));
    },
    async update(target) {
      const { id, key, pinned, text } = target;

      return change(target, await findOwnedMemory(target, id), { key, pinned, text });
    },
    async forget(target) {
      const { payload, req } = payloadOf(target);

      if (target.id !== undefined) {
        const doc = await findOwnedMemory(target, target.id);

        await payload.delete({ collection: MEMORIES_SLUG, id: doc.id, overrideAccess: true, req });

        return { deleted: 1 };
      }

      const { docs } = await payload.delete({
        collection: MEMORIES_SLUG,
        where: inBucket(target),
        overrideAccess: true,
        req,
      });

      return { deleted: docs.length };
    },
  };
}
