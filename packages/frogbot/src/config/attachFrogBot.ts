import type { PayloadRequest } from 'payload';

import { attachSessionPayload, unwrapSessionPayload } from '../auth/operation.js';
import type { FrogBot } from '../frogbot.js';
import { seedFrogBotCache } from '../getFrogBot.js';
import { getFrogBotInstanceEntry } from '../instanceRegistry.js';
import type { FrogBotRequest } from '../types/request.js';

export function attachFrogBotInstance(req: PayloadRequest, frogbot: FrogBot): FrogBotRequest {
  req.payload = unwrapSessionPayload(req.payload);
  (req as PayloadRequest & { frogbot: FrogBot }).frogbot = frogbot;

  Object.defineProperty(req, Symbol.for('@frogbotai/request-runtime'), {
    configurable: true,
    enumerable: true,
    value: req.payload,
  });

  attachSessionPayload(req);

  return req as unknown as FrogBotRequest;
}

export function attachRegisteredFrogBot(req: PayloadRequest): FrogBotRequest {
  const attached = (req as PayloadRequest & { frogbot?: FrogBot }).frogbot;
  const entry = getFrogBotInstanceEntry(unwrapSessionPayload(req.payload));

  if (!entry) {
    if (attached) return req as unknown as FrogBotRequest;

    throw new Error('[frogbot] No FrogBot instance is registered for this request.');
  }

  seedFrogBotCache(entry.frogbot, entry.config);

  if (attached === entry.frogbot) return req as unknown as FrogBotRequest;

  return attachFrogBotInstance(req, entry.frogbot);
}
