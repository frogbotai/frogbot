import type { SearchCapabilities, SearchCapability } from '../../../database/types.js';
import type { SearchIndexDescriptor, SearchMode } from '../../types.js';
import { getConnectionKind, getSearchPrerequisites } from './prerequisites.js';
import { getTokenizer } from './tokenizers.js';
import type { SQLiteSearchAdapter } from './types.js';

export const notConfigured = (mode: SearchMode): SearchCapability => ({
  unsupported: 'not-implemented',
  detail: `The index does not configure ${mode} search.`,
});

export function getLexicalCapability(index: SearchIndexDescriptor): SearchCapability {
  if (!index.lexical) return notConfigured('lexical');

  if (!getTokenizer(index.lexical.language)) {
    return {
      unsupported: 'engine-gap',
      detail: `FTS5 has no '${index.lexical.language}' tokenizer; use 'english' or 'simple'.`,
    };
  }

  return 'supported';
}

export const capabilities: SearchCapabilities = ({ db, index }) => {
  const prerequisites = getSearchPrerequisites(db);
  const kind = getConnectionKind(db as unknown as SQLiteSearchAdapter);

  let lexical = getLexicalCapability(index);

  if (lexical === 'supported' && prerequisites && !prerequisites.fts5) {
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
