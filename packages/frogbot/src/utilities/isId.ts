import type { DocID } from '../collections/config/types.js';

export function isId(value: unknown): value is DocID {
  return (typeof value === 'string' && value !== '') || Number.isInteger(value);
}
