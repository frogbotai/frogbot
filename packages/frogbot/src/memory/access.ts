import { Forbidden } from 'payload';

import { canAccessSpace } from '../spaces/access.js';
import type { MemoryAdapter, MemoryTarget } from './types.js';

export type MemoryOperationKind = 'read' | 'write';

/** `me` belongs to the signed-in person, and `space` follows the Space's own access. Other shared scopes need the app's `access` function, and are refused without one. */
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

  if (scope === 'space' && !adapter.access?.[kind]) {
    const id = scopeId.slice('space:'.length);
    const allowed = await canAccessSpace({ req, id, kind: kind === 'read' ? 'read' : 'update' });

    if (allowed) return;

    throw new Forbidden(req.t);
  }

  const allowed = await adapter.access?.[kind]?.({ req, scope, scopeId });

  if (allowed !== true) throw new Forbidden(req.t);
}
