import type { PayloadRequest, Where } from 'payload';

import { compareAndSet } from '../../database/compareAndSet.js';
import { WAITPOINTS_SLUG } from './collection.js';
import type { Waitpoint } from './types.js';

export async function updateWaitpoint({
  req,
  where,
  data,
}: {
  req: PayloadRequest;
  where: Where;
  data: Partial<Omit<Waitpoint, 'id'>>;
}): Promise<boolean> {
  return compareAndSet({ req, collection: WAITPOINTS_SLUG, where, data });
}
