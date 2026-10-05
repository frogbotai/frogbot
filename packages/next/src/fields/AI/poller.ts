import { aiFieldPaths } from 'frogbot/fields';

import { appendQuery } from '../../views/cells.js';

export type AIFieldDoc = Record<string, unknown> & { id: number | string };

export type WatchAIFieldRecordArgs = {
  api: string;
  collectionSlug: string;
  draft: boolean;
  field: string;
  id: number | string;
  locale?: string;
  onDoc: (doc: AIFieldDoc | undefined) => void;
};

type Watcher = Pick<WatchAIFieldRecordArgs, 'field' | 'id' | 'onDoc'>;

type WatchGroup = Pick<WatchAIFieldRecordArgs, 'api' | 'collectionSlug' | 'draft' | 'locale'> & {
  loading: boolean;
  watchers: Set<Watcher>;
};

export const AI_FIELD_POLL_INTERVAL = 3000;

const groups = new Map<string, WatchGroup>();

let timer: ReturnType<typeof setInterval> | undefined;

function stopWatching({ key, watcher }: { key: string; watcher: Watcher }): void {
  const group = groups.get(key);

  if (!group?.watchers.delete(watcher)) return;

  if (group.watchers.size === 0) groups.delete(key);

  if (groups.size > 0 || timer === undefined) return;

  clearInterval(timer);
  timer = undefined;
}

async function fetchDocs(group: WatchGroup, watchers: Watcher[]): Promise<AIFieldDoc[]> {
  const select = Object.fromEntries(
    watchers.flatMap(({ field }) => {
      const paths = aiFieldPaths(field);

      return [field, paths.status, paths.error].map((path) => [path, true]);
    }),
  );

  const params = new URLSearchParams({ depth: '0', pagination: 'false' });

  appendQuery(params, 'where', { id: { in: [...new Set(watchers.map(({ id }) => id))] } });
  appendQuery(params, 'select', select);
  appendQuery(params, 'locale', group.locale);

  if (group.draft) params.set('draft', 'true');

  const response = await fetch(`${group.api}/${group.collectionSlug}?${params}`, {
    credentials: 'include',
  });

  if (!response.ok) throw new Error(response.statusText);

  const result = (await response.json()) as { docs: AIFieldDoc[] };

  return result.docs;
}

async function pollGroup(key: string, group: WatchGroup): Promise<void> {
  if (group.loading) return;

  const watchers = [...group.watchers];

  group.loading = true;

  const docs = await fetchDocs(group, watchers).catch(() => undefined);

  group.loading = false;

  if (!docs) return;

  const byId = new Map(docs.map((doc) => [String(doc.id), doc]));

  watchers.forEach((watcher) => {
    if (!group.watchers.has(watcher)) return;

    const doc = byId.get(String(watcher.id));

    if (doc?.[aiFieldPaths(watcher.field).status] !== 'pending') stopWatching({ key, watcher });

    watcher.onDoc(doc);
  });
}

function tick(): void {
  groups.forEach((group, key) => void pollGroup(key, group));
}

export function watchAIFieldRecord({
  api,
  collectionSlug,
  draft,
  field,
  id,
  locale,
  onDoc,
}: WatchAIFieldRecordArgs): () => void {
  const key = [api, collectionSlug, locale ?? '', draft].join('|');
  const watcher: Watcher = { field, id, onDoc };

  const group = groups.get(key) ?? {
    api,
    collectionSlug,
    draft,
    loading: false,
    locale,
    watchers: new Set<Watcher>(),
  };

  group.watchers.add(watcher);
  groups.set(key, group);

  timer ??= setInterval(tick, AI_FIELD_POLL_INTERVAL);

  return () => stopWatching({ key, watcher });
}
