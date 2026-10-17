import type { ComposerPrompt } from './prompt.js';

/** Where the composer keeps sent prompts, newest first. */
export interface ComposerHistoryStorage {
  load: () => readonly ComposerPrompt[] | Promise<readonly ComposerPrompt[]>;
  save: (entries: readonly ComposerPrompt[]) => void | Promise<void>;
}

export const HISTORY_LIMIT = 100;

const HISTORY_KEY = 'frogbot:composer-history';

function isPrompt(value: unknown): value is ComposerPrompt {
  const prompt = value as Partial<ComposerPrompt> | null;

  return (
    typeof prompt === 'object' &&
    prompt !== null &&
    typeof prompt.text === 'string' &&
    Array.isArray(prompt.mentions)
  );
}

export const localStorageHistory: ComposerHistoryStorage = {
  load: () => {
    const entries: unknown = JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? '[]');

    return Array.isArray(entries) ? entries.filter(isPrompt) : [];
  },
  save: (entries) => window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries)),
};

function samePrompt(a: ComposerPrompt, b: ComposerPrompt) {
  return a.text === b.text && JSON.stringify(a.mentions) === JSON.stringify(b.mentions);
}

export function prependHistory(entries: readonly ComposerPrompt[], prompt: ComposerPrompt) {
  if (!prompt.text.trim()) return entries;

  const newest = entries[0];

  if (newest && samePrompt(newest, prompt)) return entries;

  return [prompt, ...entries].slice(0, HISTORY_LIMIT);
}

export interface ComposerHistory {
  entries: () => readonly ComposerPrompt[];
  add: (prompt: ComposerPrompt) => void;
}

export function createComposerHistory(storage: ComposerHistoryStorage) {
  let entries: readonly ComposerPrompt[] = [];
  let ready = false;

  const save = () => {
    const saved = entries;

    void Promise.resolve()
      .then(() => storage.save(saved))
      .catch(() => undefined);
  };

  void Promise.resolve()
    .then(() => storage.load())
    .catch(() => [])
    .then((stored) => {
      const added = entries;

      entries = [...added, ...(Array.isArray(stored) ? stored.filter(isPrompt) : [])].slice(
        0,
        HISTORY_LIMIT,
      );

      ready = true;

      if (added.length > 0) save();
    });

  const history: ComposerHistory = {
    entries: () => entries,
    add: (prompt) => {
      const next = prependHistory(entries, prompt);

      if (next === entries) return;

      entries = next;

      if (ready) save();
    },
  };

  return history;
}
