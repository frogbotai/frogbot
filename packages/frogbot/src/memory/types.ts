import type { ModelMessage } from 'ai';

import type { CollectionConfig } from '../collections/config/types.js';
import type { DatabaseAdapter } from '../database/types.js';
import type { FrogBot } from '../frogbot.js';
import type { FrogBotRequest } from '../types/request.js';

/** A saved memory. `scope` is the scope word it was saved under. */
export type Memory = {
  id: string;
  scope: string;
  key?: string;
  text: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

/** One `search` result. A higher `score` is a better match. */
export type MemorySearchHit = { memory: Memory; score: number };

/** One page of `list`. */
export type MemoryList = { docs: Memory[]; hasNextPage: boolean };

/** What a scope function receives. */
export type MemoryScopeArgs = {
  req: FrogBotRequest;
  agent?: { slug: string };
  chat?: Record<string, unknown>;
};

/** Resolves a scope word to the value that tells one scope from another, or `undefined` when the request has none. */
export type MemoryScope = (
  args: MemoryScopeArgs,
) => number | string | null | undefined | Promise<number | string | null | undefined>;

/** What a memory access function receives. */
export type MemoryAccessArgs = { req: FrogBotRequest; scope: string; scopeId: string };

/** Who may read and write the shared scopes (`agent`, `team` and custom words) when access is checked. */
export type MemoryAccess = {
  read?: (args: MemoryAccessArgs) => boolean | Promise<boolean>;
  write?: (args: MemoryAccessArgs) => boolean | Promise<boolean>;
};

/** Options every memory adapter factory accepts. Core reads them; the adapter carries them back. */
export type MemoryOptions = {
  /** Part of every memory's key, so two apps with the same agents keep their memories apart. Defaults to `''`. */
  namespace?: string;
  /** Custom scope words, or a replacement for `team`. */
  scopes?: Record<string, MemoryScope>;
  access?: MemoryAccess;
};

/** The resolved scope core hands every adapter method. */
export type MemoryTarget = {
  req: FrogBotRequest;
  namespace: string;
  /** The scope word, such as `me` or `client`. */
  scope: string;
  /** The resolved scope, such as `me:users:42`. Adapters key memories by `namespace` and `scopeId`. */
  scopeId: string;
};

export type MemorySaveArgs = MemoryTarget & { text: string; key?: string; pinned?: boolean };

export type MemorySearchArgs = MemoryTarget & { query: string; limit: number };

export type MemoryListArgs = MemoryTarget & { pinned?: boolean; limit: number; page: number };

export type MemoryGetArgs = MemoryTarget & { id: string };

export type MemoryUpdateArgs = MemoryTarget & {
  id: string;
  text?: string;
  key?: string | null;
  pinned?: boolean;
};

export type MemoryForgetArgs = MemoryTarget & { id?: string };

/** One change carried by `sync`. */
export type MemoryChange =
  | { type: 'save'; namespace: string; scopeId: string; memory: Memory }
  | { type: 'forget'; namespace: string; scopeId: string; id?: string };

/** A push and pull pair an adapter may carry for syncing elsewhere. Core stores it and adds no behavior. */
export type MemorySync = {
  push: (changes: MemoryChange[]) => Promise<void>;
  pull: (cursor: string | null) => Promise<{ changes: MemoryChange[]; cursor: string | null }>;
};

export type MemoryAfterTurnArgs = {
  req: FrogBotRequest;
  namespace: string;
  scopes: { scope: string; scopeId: string }[];
  messages: readonly ModelMessage[];
};

/** A memory backend. Core resolves scopes and checks access before it calls any method. */
export type MemoryAdapter = MemoryOptions & {
  /** The adapter's own collection, if it stores memories in the app's database. */
  collection?: (args: { db: DatabaseAdapter }) => CollectionConfig;
  /** Called once at startup, to open clients. */
  init?: (args: { frogbot: FrogBot }) => Promise<void> | void;
  /** Called after a finished agent turn. The reply never waits for it, and a throw is logged. */
  afterTurn?: (args: MemoryAfterTurnArgs) => Promise<void> | void;
  sync?: MemorySync;
  /** Adds a memory, or updates the one with the same `key` in the scope. */
  save: (args: MemorySaveArgs) => Promise<Memory>;
  search: (args: MemorySearchArgs) => Promise<MemorySearchHit[]>;
  list: (args: MemoryListArgs) => Promise<MemoryList>;
  get: (args: MemoryGetArgs) => Promise<Memory>;
  update: (args: MemoryUpdateArgs) => Promise<Memory>;
  /** Removes one memory by `id`, or the whole scope without one. */
  forget: (args: MemoryForgetArgs) => Promise<{ deleted: number }>;
};

/** Who a `frogbot.memory` call runs as, and which scope it reaches. */
export type MemoryCallArgs = {
  /** A scope word: `me`, `agent`, `team` or a custom word. */
  scope: string;
  /** The agent slug the `agent` scope and scope functions see. */
  agent?: string;
  /** The chat document scope functions see. */
  chat?: Record<string, unknown>;
  req?: Partial<FrogBotRequest>;
  user?: FrogBotRequest['user'];
  /** Skips `access`. Defaults to `true`, like every Local API operation. */
  overrideAccess?: boolean;
};

/** `frogbot.memory`. */
export type FrogBotMemory = {
  save: (
    args: MemoryCallArgs & { text: string; key?: string; pinned?: boolean },
  ) => Promise<Memory>;
  search: (args: MemoryCallArgs & { query: string; limit?: number }) => Promise<MemorySearchHit[]>;
  list: (
    args: MemoryCallArgs & { pinned?: boolean; limit?: number; page?: number },
  ) => Promise<MemoryList>;
  get: (args: MemoryCallArgs & { id: string }) => Promise<Memory>;
  update: (
    args: MemoryCallArgs & { id: string; text?: string; key?: string | null; pinned?: boolean },
  ) => Promise<Memory>;
  forget: (args: MemoryCallArgs & { id?: string }) => Promise<{ deleted: number }>;
  /** The adapter's `sync`, when it has one. */
  readonly sync?: MemorySync;
};
