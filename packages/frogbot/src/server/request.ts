// Runtime helper: ensure `req.frogbot` is populated.
//
// The singleton is stamped via the beforeOperation hook injected during
// sanitize. This module exists for backward compat and testing — the
// actual hook lives in sanitize.ts and calls getCachedFrogbot() directly.

import type { PayloadRequest } from 'payload';

import type { Frogbot } from '../frogbot.js';
import { getCachedFrogbot } from '../getFrogbot.js';

interface RequestWithFrogbot extends PayloadRequest {
  frogbot?: Frogbot;
}

export function attachFrogbot(req: PayloadRequest): void {
  const r = req as RequestWithFrogbot;
  if (r.frogbot) return;
  const frogbot = getCachedFrogbot();
  if (frogbot) {
    r.frogbot = frogbot;
  }
}
