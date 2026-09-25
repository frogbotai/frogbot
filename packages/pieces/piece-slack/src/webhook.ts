import { createHmac, timingSafeEqual } from 'node:crypto';

import type { FrogBotRequest } from 'frogbot';

const replayWindowSeconds = 300;

function eventMap(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : undefined;
}

function interactivePayload(data: unknown) {
  if (
    !data ||
    typeof data !== 'object' ||
    !('payload' in data) ||
    typeof data.payload !== 'string'
  ) {
    return undefined;
  }

  try {
    const value: unknown = JSON.parse(data.payload);

    return eventMap(value);
  } catch {
    return undefined;
  }
}

export function slackEvent(req: FrogBotRequest) {
  const interaction = interactivePayload(req.data);

  if (interaction) return interaction;

  const data = eventMap(req.data);

  if (!data) return undefined;

  return eventMap(data.event);
}

export function slackWorkspace(req: FrogBotRequest) {
  const interaction = interactivePayload(req.data);

  if (
    interaction &&
    'team' in interaction &&
    interaction.team &&
    typeof interaction.team === 'object'
  ) {
    return 'id' in interaction.team && typeof interaction.team.id === 'string'
      ? interaction.team.id
      : undefined;
  }

  const data = eventMap(req.data);

  return data && typeof data.team_id === 'string' ? data.team_id : undefined;
}

export function slackEventType(req: FrogBotRequest) {
  const interaction = interactivePayload(req.data);

  if (interaction && 'type' in interaction && typeof interaction.type === 'string') {
    return ['view_submission', 'view_closed'].includes(interaction.type)
      ? 'modal_interaction'
      : interaction.type;
  }

  const event = slackEvent(req);

  return event && 'type' in event && typeof event.type === 'string' ? event.type : '';
}

export async function verifySlackWebhook({
  req,
  options,
}: {
  req: FrogBotRequest;
  options: { signingSecret?: string };
}) {
  if (!options.signingSecret) return false;

  const timestampHeader = req.headers.get('x-slack-request-timestamp');
  const signature = req.headers.get('x-slack-signature');

  if (!timestampHeader || !signature || !/^v0=[a-f0-9]{64}$/.test(signature)) return false;

  const timestamp = Number(timestampHeader);
  const now = Math.floor(Date.now() / 1000);

  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > replayWindowSeconds) {
    return false;
  }

  const parse = req.clone;

  if (typeof parse !== 'function') return false;

  let rawBody: string;

  try {
    rawBody = await parse.call(req).text();
  } catch {
    return false;
  }

  const expected = `v0=${createHmac('sha256', options.signingSecret)
    .update(`v0:${timestampHeader}:${rawBody}`)
    .digest('hex')}`;
  const suppliedBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);

  if (
    suppliedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(suppliedBytes, expectedBytes)
  ) {
    return false;
  }

  return true;
}

export function slackHandshake(req: FrogBotRequest) {
  const data = eventMap(req.data);

  if (!data) return null;

  return typeof data.challenge === 'string'
    ? new Response(data.challenge, { headers: { 'content-type': 'text/plain' } })
    : null;
}

export function parseSlackWebhook(req: FrogBotRequest): { event: string } {
  return { event: slackEventType(req) };
}
