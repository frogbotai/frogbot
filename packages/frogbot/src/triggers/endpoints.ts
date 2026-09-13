import { addDataAndFileToRequest, type PayloadRequest } from 'payload';

import type { Endpoint } from '../endpoints/types.js';
import { pieceInstanceRuntime } from '../pieces/definePiece.js';
import type { FrogbotRequest } from '../types/request.js';
import { TRIGGER_SUBSCRIPTIONS_SLUG } from './collection.js';
import { dispatchTriggerEvents } from './dispatch.js';
import { parseSubscriptionInput } from './input.js';
import type { Subscription } from './subscriptions.js';
import type { TriggerSubscriber } from './types.js';

function requestClone(req: FrogbotRequest): FrogbotRequest {
  return Object.assign(req.clone!(), Object.fromEntries(Object.entries(req))) as FrogbotRequest;
}

async function handler(req: FrogbotRequest): Promise<Response> {
  const instanceSlug = req.routeParams?.instance as string | undefined;
  const subscription = req.routeParams?.subscription as string | undefined;
  const entry = instanceSlug ? req.frogbot.config._internal.triggers[instanceSlug] : undefined;
  if (!entry) return new Response(null, { status: 404 });
  const runtime = pieceInstanceRuntime(entry.instance);
  const { definition } = runtime;
  if (!definition.webhook) return new Response(null, { status: 404 });
  const webhookReq = Object.assign(requestClone(req), { user: null });
  if (req.method === 'GET') {
    return (
      (await definition.webhook.handshake?.({
        req: requestClone(webhookReq),
        options: runtime.options as never,
      })) ?? new Response(null, { status: 404 })
    );
  }
  const verifyReq = requestClone(req);
  if (!(await definition.webhook.verify({ req: verifyReq, options: runtime.options as never }))) {
    return new Response(null, { status: 401 });
  }
  let row: Subscription | undefined;
  if (subscription) {
    const result = await req.frogbot.find({
      collection: TRIGGER_SUBSCRIPTIONS_SLUG,
      where: { and: [{ id: { equals: subscription } }, { instance: { equals: instanceSlug } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never);
    row = (result.docs as Subscription[])[0];
    if (!row) return new Response(null, { status: 404 });
  }
  const parsedReq = requestClone(webhookReq);
  await addDataAndFileToRequest(parsedReq as unknown as PayloadRequest);
  webhookReq.data = parsedReq.data;
  const handshake = definition.webhook.handshake
    ? await definition.webhook.handshake({
        req: requestClone(webhookReq),
        options: runtime.options as never,
      })
    : null;
  if (handshake) return handshake;
  let subscribers: TriggerSubscriber[];
  if (row) {
    if (row.status !== 'active' || row.enablePending || row.cleanupPending) {
      return new Response(null, { status: 404 });
    }
    const { agent, trigger } = row;
    subscribers = entry.subscribers.filter(
      (candidate) =>
        candidate.trigger.trigger.type === 'webhook' &&
        candidate.agentSlug === agent &&
        candidate.trigger.trigger.slug === trigger,
    );
    if (!subscribers.length) return new Response(null, { status: 404 });
  } else {
    const event = definition.webhook.parse?.({ req: requestClone(webhookReq) }).event;
    subscribers = entry.subscribers.filter(
      (candidate) =>
        candidate.trigger.trigger.type === 'app' && candidate.trigger.trigger.event === event,
    );
  }
  await Promise.all(
    subscribers.map(async (candidate) => {
      const trigger = definition.triggers?.find(
        (candidateTrigger) => candidateTrigger.slug === candidate.trigger.trigger.slug,
      );
      if (!trigger || (trigger.type !== 'webhook' && trigger.type !== 'app')) return;
      const triggerReq = requestClone(webhookReq);
      const input = row
        ? parseSubscriptionInput({ schema: trigger.input, input: row.input })
        : candidate.input;
      const events = await trigger.run({
        input: input as never,
        client: (await runtime.client({ req: triggerReq })) as never,
        options: runtime.options as never,
        req: triggerReq,
      });
      await dispatchTriggerEvents({ events, frogbot: req.frogbot, subscribers: [candidate] });
    }),
  );
  return Response.json({ ok: true });
}

export function buildTriggerEndpoints(): Endpoint[] {
  return [
    { path: '/webhooks/:instance', method: 'get', handler },
    { path: '/webhooks/:instance', method: 'post', handler },
    { path: '/webhooks/:instance/:subscription', method: 'post', handler },
  ];
}
