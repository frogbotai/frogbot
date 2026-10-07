import type { PayloadRequest } from 'payload';

import { attachSessionPayload, unwrapSessionPayload } from '../auth/operation.js';
import type { FrogBot } from '../frogbot.js';
import { seedFrogBotCache } from '../getFrogBot.js';
import { getFrogBotInstanceEntry } from '../instanceRegistry.js';
import { hasFrogBot } from '../seams/request.js';
import type { FrogBotRequest } from '../types/request.js';

export function attachFrogBotInstance(req: PayloadRequest, frogbot: FrogBot): FrogBotRequest {
  req.payload = unwrapSessionPayload(req.payload);
  const attached = Object.assign(req, { frogbot });

  Object.defineProperty(req, Symbol.for('@frogbotai/request-runtime'), {
    configurable: true,
    enumerable: true,
    value: req.payload,
  });

  attachSessionPayload(req);

  return attached;
}

export function attachRegisteredFrogBot(req: PayloadRequest): FrogBotRequest {
  const entry = getFrogBotInstanceEntry(unwrapSessionPayload(req.payload));

  if (!entry) {
    if (hasFrogBot(req)) return req;

    throw new Error('[frogbot] No FrogBot instance is registered for this request.');
  }

  seedFrogBotCache(entry.frogbot, entry.config);

  if (hasFrogBot(req) && req.frogbot === entry.frogbot) return req;

  return attachFrogBotInstance(req, entry.frogbot);
}
