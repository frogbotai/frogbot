import type { SearchFilterNode } from '../types.js';

export function buildSearchOperator(filter: SearchFilterNode): Record<string, unknown> {
  switch (filter.type) {
    case 'and':
      return { compound: { filter: filter.filters.map(buildSearchOperator) } };
    case 'or':
      return {
        compound: { should: filter.filters.map(buildSearchOperator), minimumShouldMatch: 1 },
      };
    case 'not':
      return { compound: { mustNot: [buildSearchOperator(filter.filter)] } };
    case 'equals':
      return { equals: { path: filter.path, value: filter.value } };
    case 'exists':
      return { exists: { path: filter.path } };
    case 'in':
      return { in: { path: filter.path, value: filter.values } };
    case 'range':
      return { range: { path: filter.path, ...filter.range } };
  }
}
