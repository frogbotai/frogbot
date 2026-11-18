import type { DocID } from '../collections/config/types.js';
import { isId } from './isId.js';
import { isRecord } from './isRecord.js';

export function relationID(value: unknown): DocID | null {
  const id = isRecord(value) ? value['id'] : value;

  return isId(id) ? id : null;
}
