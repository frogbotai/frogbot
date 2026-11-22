import type { Where } from 'payload';

import type { MemorySearchHit, MemoryTarget } from '../types.js';
import { MEMORIES_SLUG, MEMORY_SEARCH_INDEX } from './collection.js';
import { anyWordQuery, memoryWords } from './dedupe.js';
import { findMemories, memoryBucket, type MemoryDoc, toMemory, toMemoryDoc } from './store.js';

const FALLBACK_WORDS = 16;

const FALLBACK_CANDIDATES = 500;

/** Searches the memory index: lexical, and hybrid when a query vector is given. */
export async function searchMemoryIndex({
  limit,
  query,
  target,
  vector,
}: {
  limit: number;
  query: string;
  target: MemoryTarget;
  vector?: number[];
}): Promise<{ doc: MemoryDoc; score: number }[]> {
  const text = anyWordQuery(query);

  if (!text && !vector) return [];

  const { hits } = await target.req.frogbot.search({
    collection: MEMORIES_SLUG,
    index: MEMORY_SEARCH_INDEX,
    query: { ...(text ? { text } : {}), ...(vector ? { vector } : {}) },
    where: { bucket: { equals: memoryBucket(target) } },
    limit,
    depth: 0,
    overrideAccess: true,
    req: target.req,
  });

  return hits.map(({ doc, score }) => ({ doc: toMemoryDoc(doc), score }));
}

/** Plain MongoDB: a case-insensitive substring match on text and key, ranked by the share of query words matched. */
export async function searchMemoryFallback({
  limit,
  query,
  target,
}: {
  limit: number;
  query: string;
  target: MemoryTarget;
}): Promise<MemorySearchHit[]> {
  const words = memoryWords(query).slice(0, FALLBACK_WORDS);

  if (!words.length) return [];

  const { docs } = await findMemories({
    target,
    where: {
      or: words.flatMap((word): Where[] => [
        { text: { contains: word } },
        { key: { contains: word } },
      ]),
    },
    limit: FALLBACK_CANDIDATES,
    sort: '-updatedAt',
  });

  return docs
    .map((doc) => {
      const haystack = `${doc.text} ${doc.key ?? ''}`.toLowerCase();
      const matched = words.filter((word) => haystack.includes(word)).length;

      return { memory: toMemory(doc), score: matched / words.length };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
