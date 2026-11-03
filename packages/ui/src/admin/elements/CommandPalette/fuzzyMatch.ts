import type { PaletteRow } from './buildPaletteModel.js';

export type FuzzyMatchResult = {
  indices: number[];
  score: number;
};

export type PaletteRowMatch = PaletteRow & { matchIndices?: number[] };

export type PaletteRowGroup = {
  group: string | null;
  rows: PaletteRowMatch[];
};

const START_BONUS = 12;
const WORD_BOUNDARY_BONUS = 10;
const CONSECUTIVE_BONUS = 8;
const GAP_PENALTY = 1;

const isWordChar = (char: string | undefined): boolean =>
  Boolean(char) && /[a-z0-9]/i.test(char as string);

/**
 * Case-insensitive fuzzy subsequence match, as in the admin's own command palette. Returns `null`
 * when `query` is not a subsequence of `target`. Scores rank matches of one query only.
 */
export function fuzzyMatch(query: string, target: string): FuzzyMatchResult | null {
  if (!query) return { indices: [], score: 0 };

  const q = query.toLowerCase();
  const t = target.toLowerCase();
  const indices: number[] = [];

  let score = 0;
  let queryIndex = 0;
  let prevMatchIndex = -1;

  for (let targetIndex = 0; targetIndex < t.length && queryIndex < q.length; targetIndex++) {
    if (t[targetIndex] !== q[queryIndex]) continue;

    indices.push(targetIndex);

    if (targetIndex === 0) {
      score += START_BONUS;
    } else if (!isWordChar(target[targetIndex - 1])) {
      score += WORD_BOUNDARY_BONUS;
    }

    if (prevMatchIndex === targetIndex - 1) {
      score += CONSECUTIVE_BONUS;
    } else if (prevMatchIndex !== -1) {
      score -= (targetIndex - prevMatchIndex - 1) * GAP_PENALTY;
    }

    prevMatchIndex = targetIndex;
    queryIndex++;
  }

  if (queryIndex < q.length) return null;

  return { indices, score };
}

/** Groups rows in order, then fuzzy-filters and ranks each group, dropping empty ones. */
export function filterRows(rows: PaletteRow[], query: string): PaletteRowGroup[] {
  const groups = new Map<string | null, PaletteRow[]>();

  for (const row of rows) groups.set(row.group, [...(groups.get(row.group) ?? []), row]);

  const text = query.trim();

  return [...groups].flatMap(([group, groupRows]) => {
    if (!text) return [{ group, rows: groupRows }];

    const matched = groupRows
      .map((row) => ({ match: fuzzyMatch(text, row.label), row }))
      .filter((scored): scored is { match: FuzzyMatchResult; row: PaletteRow } =>
        Boolean(scored.match),
      )
      .sort((a, b) => b.match.score - a.match.score)
      .map(({ match, row }) => ({ ...row, matchIndices: match.indices }));

    return matched.length ? [{ group, rows: matched }] : [];
  });
}
