import type { FrogBot } from '../frogbot.js';
import {
  boundedInteger,
  invalid,
  optionalKey,
  optionalPinned,
  requireID,
  requireMemoryText,
  requireText,
  resolveMemoryTarget,
} from './run.js';
import type { FrogBotMemory } from './types.js';

export const MAX_SEARCH_LIMIT = 100;

export const MAX_LIST_LIMIT = 1_000;

/** Builds `frogbot.memory`. Every call resolves the scope and checks access before the adapter runs. */
export function createMemory(frogbot: FrogBot): FrogBotMemory {
  return {
    get sync() {
      return frogbot.config.memory?.sync;
    },
    async save({ key, pinned, text, ...args }) {
      const input = {
        text: requireMemoryText(text),
        key: optionalKey(key),
        pinned: optionalPinned(pinned),
      };

      const { adapter, target } = await resolveMemoryTarget({ args, frogbot, kind: 'write' });

      return adapter.save({ ...target, ...input });
    },
    async search({ limit, query, ...args }) {
      const input = {
        query: requireText(query, 'query'),
        limit: boundedInteger({ fallback: 10, max: MAX_SEARCH_LIMIT, name: 'limit', value: limit }),
      };

      const { adapter, target } = await resolveMemoryTarget({ args, frogbot, kind: 'read' });

      return adapter.search({ ...target, ...input });
    },
    async list({ limit, page, pinned, ...args }) {
      const input = {
        pinned: optionalPinned(pinned),
        limit: boundedInteger({ fallback: 100, max: MAX_LIST_LIMIT, name: 'limit', value: limit }),
        page: boundedInteger({
          fallback: 1,
          max: Number.MAX_SAFE_INTEGER,
          name: 'page',
          value: page,
        }),
      };

      const { adapter, target } = await resolveMemoryTarget({ args, frogbot, kind: 'read' });

      return adapter.list({ ...target, ...input });
    },
    async get({ id, ...args }) {
      const input = { id: requireID(id) };
      const { adapter, target } = await resolveMemoryTarget({ args, frogbot, kind: 'read' });

      return adapter.get({ ...target, ...input });
    },
    async update({ id, key, pinned, text, ...args }) {
      const input = {
        id: requireID(id),
        ...(text !== undefined ? { text: requireMemoryText(text) } : {}),
        ...(key !== undefined ? { key: key === null ? null : optionalKey(key) } : {}),
        ...(pinned !== undefined ? { pinned: optionalPinned(pinned) } : {}),
      };

      if (Object.keys(input).length === 1) {
        throw invalid('Memory `update` needs `text`, `key` or `pinned`.');
      }

      const { adapter, target } = await resolveMemoryTarget({ args, frogbot, kind: 'write' });

      return adapter.update({ ...target, ...input });
    },
    async forget({ id, ...args }) {
      const input = id === undefined ? {} : { id: requireID(id) };
      const { adapter, target } = await resolveMemoryTarget({ args, frogbot, kind: 'write' });

      return adapter.forget({ ...target, ...input });
    },
  };
}
