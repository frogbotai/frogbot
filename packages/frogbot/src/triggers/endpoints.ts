import { addDataAndFileToRequest, type PayloadRequest } from 'payload';

import { getChannelHost } from '../channels/host.js';
import type { Endpoint } from '../endpoints/types.js';
import { pieceInstanceRuntime } from '../pieces/definePiece.js';
import type { FrogBotRequest } from '../types/request.js';
import { TRIGGER_SUBSCRIPTIONS_SLUG } from './collection.js';
import { dispatchTriggerEvents } from './dispatch.js';
import { parseSubscriptionInput } from './input.js';
import { requiresAdapterVerification } from './registry.js';
import type { Subscription } from './subscriptions.js';
import type { TriggerSubscriber } from './types.js';

function requestClone(req: FrogBotRequest): FrogBotRequest {
  return Object.assign(req.clone!(), Object.fromEntries(Object.entries(req))) as FrogBotRequest;
}

async function handler(req: FrogBotRequest): Promise<Response> {
  const instanceSlug = req.routeParams?.instance as string | undefined;
  const subscription = req.routeParams?.subscription as string | undefined;
  const entry = instanceSlug ? req.frogbot.config._internal.triggers[instanceSlug] : undefined;

  if (!entry) return new Response(null, { status: 404 });

  const runtime = pieceInstanceRuntime(entry.instance);
  const { definition } = runtime;
  const webhookReq = Object.assign(requestClone(req), { user: null });
  const channelRequest =
    !subscription && (entry.channelAgentSlug || requiresAdapterVerification(entry))
      ? requestClone(req)
      : undefined;

  const channelHost = channelRequest ? getChannelHost(req.frogbot) : undefined;

  if (channelRequest && !channelHost) {
    return new Response('Channel host unavailable', { status: 503 });
  }

  if (req.method === 'GET') {
    const channelResponse = channelRequest
      ? await channelHost!.webhook(instanceSlug!, channelRequest as unknown as Request)
      : undefined;

    if (channelResponse) return channelResponse;

    if (channelRequest) return new Response('Channel binding unavailable', { status: 503 });

    if (!definition.webhook) return new Response(null, { status: 404 });

    return (
      (await definition.webhook.handshake?.({
        req: requestClone(webhookReq),
        options: runtime.options as never,
      })) ?? new Response(null, { status: 404 })
    );
  }

  if (!subscription && !definition.webhook && !channelRequest) {
    return new Response(null, { status: 404 });
  }

  if (definition.webhook?.verify) {
    const verifyReq = requestClone(req);

    if (!(await definition.webhook.verify({ req: verifyReq, options: runtime.options as never }))) {
      return new Response(null, { status: 401 });
    }
  } else if (definition.webhook && !channelRequest) {
    return new Response(null, { status: 401 });
  }

  const channelResponse = channelRequest
    ? await channelHost!.webhook(instanceSlug!, channelRequest as unknown as Request)
    : undefined;

  if (channelRequest && !channelResponse) {
    return new Response('Channel binding unavailable', { status: 503 });
  }

  if (channelResponse && !channelResponse.ok) return channelResponse;

  const triggerResponse = await dispatchWebhookTriggers({
    req,
    instanceSlug: instanceSlug!,
    subscription,
    entry,
    runtime,
    webhookReq,
  });

  return triggerResponse.ok ? (channelResponse ?? triggerResponse) : triggerResponse;
}

async function dispatchWebhookTriggers({
  req,
  instanceSlug,
  subscription,
  entry,
  runtime,
  webhookReq,
}: {
  req: FrogBotRequest;
  instanceSlug: string;
  subscription?: string;
  entry: NonNullable<FrogBotRequest['frogbot']['config']['_internal']['triggers'][string]>;
  runtime: ReturnType<typeof pieceInstanceRuntime>;
  webhookReq: FrogBotRequest;
}): Promise<Response> {
  const { definition } = runtime;

  if (!subscription && !definition.webhook) return Response.json({ ok: true });

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
  const handshake = definition.webhook?.handshake
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
    if (!definition.webhook) return new Response(null, { status: 404 });

    const event = definition.webhook.parse?.({ req: requestClone(webhookReq) }).event;
    subscribers = entry.subscribers.filter(
      (candidate) =>
        candidate.trigger.trigger.type === 'app' && candidate.trigger.trigger.event === event,
    );
  }

  const results = await Promise.allSettled(
    subscribers.map(async (candidate) => {
      const trigger = definition.triggers?.find(
        (candidateTrigger) => candidateTrigger.slug === candidate.trigger.trigger.slug,
      );

      if (!trigger || (trigger.type !== 'webhook' && trigger.type !== 'app')) return;

      const triggerReq = requestClone(webhookReq);
      const input = row
        ? parseSubscriptionInput({ schema: trigger.input, input: row.input })
        : candidate.input;
      const context = {
        input: input as never,
        client: (await runtime.client({ req: triggerReq })) as never,
        options: runtime.options as never,
        req: triggerReq,
      };

      let events;

      if (trigger.type === 'webhook') {
        if (!row) return;

        events = await trigger.run({ ...context, state: row.state });
      } else {
        events = await trigger.run(context);
      }

      await dispatchTriggerEvents({ events, frogbot: req.frogbot, subscribers: [candidate] });
    }),
  );

  const errors = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));

  if (errors.length) {
    throw new AggregateError(errors, '[frogbot] App trigger ingress failed.');
  }

  return Response.json({ ok: true });
}

export function buildTriggerEndpoints(): Endpoint[] {
  return [
    { path: '/webhooks/:instance', method: 'get', handler },
    { path: '/webhooks/:instance', method: 'post', handler },
    { path: '/webhooks/:instance/:subscription', method: 'post', handler },
  ];
}
