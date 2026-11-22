import type { SettingsEntry } from '../admin/types.js';
import type { CollectionConfig } from '../collections/config/types.js';
import type { DatabaseAdapter } from '../database/types.js';
import type { MemoryAdapter } from './types.js';

const METHODS = ['save', 'search', 'list', 'get', 'update', 'forget'] as const;

const OPTIONAL = ['collection', 'init', 'afterTurn'] as const;

const SCOPE_WORD = /^[a-z][a-z0-9_-]*$/;

function fail(message: string): never {
  throw new Error(`[frogbot] memory: ${message}`);
}

function isFunction(value: unknown): boolean {
  return typeof value === 'function';
}

function checkScopes(scopes: unknown): void {
  if (scopes === undefined) return;

  if (typeof scopes !== 'object' || scopes === null || Array.isArray(scopes)) {
    fail('`scopes` must be an object of scope functions');
  }

  for (const [word, resolve] of Object.entries(scopes)) {
    if (word === 'me' || word === 'agent') {
      fail(`scope '${word}' is built in and can't be replaced`);
    }

    if (!SCOPE_WORD.test(word)) {
      fail(`scope '${word}' must start with a lowercase letter and use a-z, 0-9, _ or -`);
    }

    if (!isFunction(resolve)) fail(`scope '${word}' must be a function`);
  }
}

function checkAdapter(memory: MemoryAdapter): void {
  if (typeof memory !== 'object' || memory === null) {
    fail('must be a memory adapter, such as `databaseMemory()`');
  }

  for (const method of METHODS) {
    if (!isFunction(memory[method])) fail(`the adapter must define \`${method}\``);
  }

  for (const method of OPTIONAL) {
    if (memory[method] !== undefined && !isFunction(memory[method])) {
      fail(`\`${method}\` must be a function`);
    }
  }

  if (memory.namespace !== undefined && typeof memory.namespace !== 'string') {
    fail('`namespace` must be a string');
  }

  checkScopes(memory.scopes);

  for (const kind of ['read', 'write'] as const) {
    if (memory.access?.[kind] !== undefined && !isFunction(memory.access[kind])) {
      fail(`\`access.${kind}\` must be a function`);
    }
  }

  if (
    memory.sync !== undefined &&
    (!isFunction(memory.sync?.push) || !isFunction(memory.sync?.pull))
  ) {
    fail('`sync` must have `push` and `pull` functions');
  }
}

/** Checks the root `memory` adapter, adds the Memory settings page, and returns the collection the adapter adds, if any. */
export function sanitizeMemory({
  collections,
  db,
  memory,
  settings,
}: {
  collections: readonly CollectionConfig[];
  db: DatabaseAdapter;
  memory: MemoryAdapter;
  settings: SettingsEntry[];
}): CollectionConfig | undefined {
  checkAdapter(memory);

  if (settings.some(({ path }) => path === 'memory' || path.startsWith('memory/'))) {
    fail("settings path 'memory' is reserved for the Memory page");
  }

  settings.push({
    path: 'memory',
    label: 'Memory',
    Component: '@frogbotai/ui/admin/rsc#MemoryView',
  });

  const collection = memory.collection?.({ db });

  if (collection && collections.some(({ slug }) => slug === collection.slug)) {
    fail(`collection slug '${collection.slug}' is reserved for memories`);
  }

  return collection;
}
