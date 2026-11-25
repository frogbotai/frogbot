import { Forbidden } from 'payload';

import { canAccessSpace } from '../spaces/access.js';
import type { MemoryAdapter, MemoryTarget } from './types.js';

export type MemoryOperationKind = 'read' | 'write';

/** `me` belongs to the signed-in person. `space` always needs the Space's own access, and the app's `access` function too when it sets one. Other shared scopes need the app's `access` function, and are refused without one. */
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

  if (scope === 'space') {
    const id = scopeId.slice('space:'.length);
    const space = await canAccessSpace({ req, id, kind: kind === 'read' ? 'read' : 'update' });

    if (!space) throw new Forbidden(req.t);

    if (!adapter.access?.[kind]) return;
  }

  const allowed = await adapter.access?.[kind]?.({ req, scope, scopeId });

  if (allowed !== true) throw new Forbidden(req.t);
}
