import type { Payload } from 'payload';

import { SearchCapabilityError } from '../../errors.js';
import type { SearchCollection } from '../../types.js';
import { capabilities } from './capabilities.js';
import type { SQLiteSearchAdapter } from './types.js';

export type SearchPrerequisites = {
  fts5: boolean;
  vector: boolean;
};

const probes = new WeakMap<object, Promise<SearchPrerequisites>>();
const results = new WeakMap<object, SearchPrerequisites>();

async function succeeds(adapter: SQLiteSearchAdapter, statement: string): Promise<boolean> {
  try {
    await adapter.client.execute(statement);

    return true;
  } catch {
    return false;
  }
}

async function probe(adapter: SQLiteSearchAdapter): Promise<SearchPrerequisites> {
  await adapter.client.execute('SELECT 1');

  const modules = await adapter.client
    .execute(`SELECT 1 FROM pragma_module_list WHERE "name" = 'fts5'`)
    .then(({ rows }) => rows.length > 0)
    .catch(() => false);

  const fts5 =
    modules ||
    ((await succeeds(
      adapter,
      'CREATE VIRTUAL TABLE temp."frogbot_search_probe" USING fts5("value")',
    )) &&
      (await succeeds(adapter, 'DROP TABLE temp."frogbot_search_probe"')));

  const vector = await succeeds(adapter, `SELECT vector_extract(vector32('[0.1,0.2]'))`);

  return { fts5, vector };
}

function probeSearchPrerequisites(adapter: SQLiteSearchAdapter): Promise<SearchPrerequisites> {
  let pending = probes.get(adapter);

  if (!pending) {
    pending = probe(adapter).then((result) => {
      results.set(adapter, result);

      return result;
    });

    pending.catch(() => probes.delete(adapter));
    probes.set(adapter, pending);
  }

  return pending;
}

export function getSearchPrerequisites(adapter: object): SearchPrerequisites | undefined {
  return results.get(adapter);
}

export function getConnectionKind(adapter: SQLiteSearchAdapter): string {
  const url = String(adapter.clientConfig?.url ?? '');

  return url.startsWith('file:') || url === ':memory:' ? 'local' : 'remote';
}

export type AssertSearchPrerequisitesArgs = {
  adapter: SQLiteSearchAdapter;
  collections: SearchCollection[];
};

export async function assertSearchPrerequisites({
  adapter,
  collections,
}: AssertSearchPrerequisitesArgs): Promise<void> {
  if (!collections.length || !adapter.client) return;

  await probeSearchPrerequisites(adapter);

  for (const { slug, search } of collections) {
    for (const index of Object.values(search)) {
      const modes = capabilities({
        collection: slug,
        db: adapter as unknown as Payload['db'],
        index,
      });

      for (const mode of ['lexical', 'vector'] as const) {
        const capability = modes[mode];

        if (!index[mode] || capability === 'supported') continue;

        if (capability.unsupported === 'missing-prerequisite') {
          throw new SearchCapabilityError(
            slug,
            index.name,
            mode,
            capability.unsupported,
            capability.detail,
          );
        }
      }
    }
  }
}
