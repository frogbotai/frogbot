import { describe, expect, it } from 'vitest';

import {
  compactModelSearch,
  matchesModelSearch,
  normalizeModelSearch,
} from '../../../../packages/ui/src/chat/model-search';

function matches(query: string, values: readonly string[]) {
  const searchable = values.map((value) => ({
    normalized: normalizeModelSearch(value),
    compact: compactModelSearch(value),
  }));

  return matchesModelSearch(query, searchable);
}

describe('model search', () => {
  it.each(['claude sonnet', 'claude-sonnet', 'claudesonnet', 'CLAUDE__SONNET'])(
    'matches name query %s',
    (query) => {
      expect(matches(query, ['Claude Sonnet 4.5'])).toBe(true);
    },
  );

  it('collapses punctuation and whitespace while preserving Unicode letters and numbers', () => {
    expect(normalizeModelSearch('  ÉCLAIR---モデル  １２ ')).toBe('éclair モデル １２');
    expect(compactModelSearch('  ÉCLAIR---モデル  １２ ')).toBe('éclairモデル１２');
    expect(matches('éclairモデル', ['Éclair モデル'])).toBe(true);
  });

  it('matches a full ID even when the display name differs', () => {
    expect(
      matches('nova-micro-v1', ['Nova Micro', 'bedrock/amazon.nova-micro-v1:0', 'bedrock']),
    ).toBe(true);
  });

  it('matches the provider', () => {
    expect(matches('BEDROCK', ['Nova Micro', 'bedrock'])).toBe(true);
  });

  it.each(['', '   ', ' -- ', '(', '[', '*'])(
    'treats query %s as empty without constructing a regex',
    (query) => {
      expect(matches(query, ['Any model'])).toBe(true);
    },
  );

  it.each(['nova[micro', 'nova(micro', 'nova*micro'])(
    'matches punctuation query %s with plain substrings',
    (query) => {
      expect(matches(query, ['Nova Micro'])).toBe(true);
    },
  );

  it('rejects an unrelated query', () => {
    expect(matches('sonnet', ['Nova Micro', 'bedrock/amazon.nova-micro-v1:0', 'bedrock'])).toBe(
      false,
    );
  });

  it('does not match a query split across separate values', () => {
    expect(matches('bedrock nova', ['Nova Micro', 'bedrock'])).toBe(false);
  });
});
