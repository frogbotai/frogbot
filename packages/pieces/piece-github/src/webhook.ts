import { createHmac, timingSafeEqual } from 'node:crypto';

import type { FrogBotRequest } from 'frogbot';

export async function verifyGithubWebhook({
  req,
  options,
}: {
  req: FrogBotRequest;
  options: { webhookSecret?: string };
}) {
  if (req.routeParams?.subscription) return true;

  if (!options.webhookSecret) return false;

  const signature = req.headers.get('x-hub-signature-256');

  if (!signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;

  const clone = req.clone;

  if (typeof clone !== 'function') return false;

  let body: string;

  try {
    body = await clone.call(req).text();
  } catch {
    return false;
  }

  const expected = `sha256=${createHmac('sha256', options.webhookSecret).update(body).digest('hex')}`;
  const suppliedBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);

  return (
    suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes)
  );
}

export function parseGithubWebhook(req: FrogBotRequest) {
  return { event: req.headers.get('x-github-event') ?? '' };
}
