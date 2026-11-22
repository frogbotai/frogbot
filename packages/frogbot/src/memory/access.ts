import { Forbidden } from 'payload';

import type { MemoryAdapter, MemoryTarget } from './types.js';

export type MemoryOperationKind = 'read' | 'write';

/** `me` belongs to the signed-in person; shared scopes need the app's `access` function, and are refused without one. */
export async function checkMemoryAccess({
  adapter,
  kind,
  target: { req, scope, scopeId },
}: {
  adapter: MemoryAdapter;
  kind: MemoryOperationKind;
  target: MemoryTarget;
}): Promise<void> {
  if (scope === 'me') return;

  const allowed = await adapter.access?.[kind]?.({ req, scope, scopeId });

  if (allowed !== true) throw new Forbidden(req.t);
}
