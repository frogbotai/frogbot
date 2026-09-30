import type { PayloadRequest } from 'payload';

import { attachSessionPayload, unwrapSessionPayload } from '../auth/operation.js';
import type { FrogBot } from '../frogbot.js';
import { getFrogBotInstance } from '../instanceRegistry.js';
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
  req.payload = unwrapSessionPayload(req.payload);

  const frogbot = getFrogBotInstance(req.payload);

  if (!frogbot) {
    throw new Error('[frogbot] No FrogBot instance is registered for this request.');
  }

  return attachFrogBotInstance(req, frogbot);
}
