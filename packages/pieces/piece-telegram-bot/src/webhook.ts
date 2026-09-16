import { timingSafeEqual } from 'node:crypto';

import type { FrogbotRequest } from 'frogbot';

export async function verifyTelegramWebhook({
  req,
  options,
}: {
  req: FrogbotRequest;
  options: { webhookSecret?: string };
}) {
  if (!options.webhookSecret) return false;

  const supplied = req.headers.get('x-telegram-bot-api-secret-token');

  if (!supplied) return false;

  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(options.webhookSecret);

  return (
    suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes)
  );
}

export function parseTelegramWebhook() {
  return { event: 'update' };
}
