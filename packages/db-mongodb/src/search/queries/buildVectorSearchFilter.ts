import type { SearchFilterNode } from '../types.js';

export function buildVectorSearchFilter(filter: SearchFilterNode): Record<string, unknown> {
  switch (filter.type) {
    case 'and':
      return { $and: filter.filters.map(buildVectorSearchFilter) };
    case 'or':
      return { $or: filter.filters.map(buildVectorSearchFilter) };
    case 'not':
      return { $nor: [buildVectorSearchFilter(filter.filter)] };
    case 'equals':
      return { [filter.path]: { $eq: filter.value } };
    case 'exists':
      return { [filter.path]: { $exists: true } };
    case 'in':
      return { [filter.path]: { $in: filter.values } };
    case 'range':
      return {
        [filter.path]: Object.fromEntries(
          Object.entries(filter.range).map(([operator, value]) => [`$${operator}`, value]),
        ),
      };
  }
}
