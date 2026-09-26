import type { SearchCapabilities, SearchCapability } from '../../../database/types.js';
import { getConnectionKind, getSearchPrerequisites } from './prerequisites.js';
import { getTokenizer } from './tokenizers.js';
import type { SQLiteSearchAdapter } from './types.js';

const notConfigured = (mode: string): SearchCapability => ({
  unsupported: 'not-implemented',
  detail: `The index does not configure ${mode} search.`,
});

export const capabilities: SearchCapabilities = ({ db, index }) => {
  const prerequisites = getSearchPrerequisites(db);
  const kind = getConnectionKind(db as unknown as SQLiteSearchAdapter);

  let lexical: SearchCapability = 'supported';

  if (!index.lexical) {
    lexical = notConfigured('lexical');
  } else if (!getTokenizer(index.lexical.language)) {
    lexical = {
      unsupported: 'engine-gap',
      detail: `FTS5 has no '${index.lexical.language}' tokenizer; use 'english' or 'simple'.`,
    };
  } else if (prerequisites && !prerequisites.fts5) {
    lexical = {
      unsupported: 'missing-prerequisite',
      detail: `The ${kind} LibSQL connection has no FTS5 module.`,
    };
  }

  let vector: SearchCapability = 'supported';

  if (!index.vector) {
    vector = notConfigured('vector');
  } else if (index.vector.metric === 'dotProduct') {
    vector = {
      unsupported: 'engine-gap',
      detail: 'LibSQL has no inner product vector distance; use cosine or euclidean.',
    };
  } else if (prerequisites && !prerequisites.vector) {
    vector = {
      unsupported: 'missing-prerequisite',
      detail: `The ${kind} LibSQL connection has no native vector functions (vector32, vector_distance_cos).`,
    };
  }

  const hybrid: SearchCapability = !index.hybrid
    ? notConfigured('hybrid')
    : lexical !== 'supported'
      ? lexical
      : vector;

  return { hybrid, lexical, vector };
};
