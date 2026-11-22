import type { FormQuestion, FormValue } from './types.js';

const PREFIX = 'frogbot-form:';

function key(slug: string): string {
  return `${PREFIX}${slug}`;
}

function fits(question: FormQuestion, value: unknown): value is FormValue {
  if (question.type === 'checkbox') return typeof value === 'boolean';

  if (question.type === 'select' && question.hasMany) {
    return Array.isArray(value) && value.every((item) => typeof item === 'string');
  }

  return typeof value === 'string';
}

/** Answers this browser kept for the form, checked against its questions. Files are never kept. */
export function loadAnswers(slug: string, questions: FormQuestion[]): Record<string, FormValue> {
  let stored: unknown;

  try {
    stored = JSON.parse(window.localStorage.getItem(key(slug)) ?? 'null');
  } catch {
    return {};
  }

  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {};

  const saved = stored as Record<string, unknown>;

  return Object.fromEntries(
    questions.flatMap((question) => {
      const value = saved[question.key];

      return question.type !== 'upload' &&
        Object.hasOwn(saved, question.key) &&
        fits(question, value)
        ? [[question.key, value]]
        : [];
    }),
  );
}

/** Keeps the answers, not files, in this browser until the form is sent. False when storage is full or blocked. */
export function saveAnswers(
  slug: string,
  questions: FormQuestion[],
  values: Record<string, FormValue>,
): boolean {
  const kept = Object.fromEntries(
    questions.flatMap(({ key: name, type }) =>
      type !== 'upload' && Object.hasOwn(values, name) ? [[name, values[name]]] : [],
    ),
  );

  try {
    window.localStorage.setItem(key(slug), JSON.stringify(kept));

    return true;
  } catch {
    return false;
  }
}

/** Forgets the kept answers. False when storage is blocked, as in some private windows. */
export function clearAnswers(slug: string): boolean {
  try {
    window.localStorage.removeItem(key(slug));

    return true;
  } catch {
    return false;
  }
}

/** Sends a view or start count. It never blocks or fails the form. */
export function ping(url: string, type: 'start' | 'view'): void {
  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type }),
    keepalive: true,
  }).catch(() => undefined);
}
