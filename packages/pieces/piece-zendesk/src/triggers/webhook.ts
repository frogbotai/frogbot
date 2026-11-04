import { createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import { type ZendeskClient, ZendeskError } from '../client.js';
import { zendeskId } from '../config.js';
import { defineWebhookTrigger } from '../define.js';

const prefix = 'zen:event-type:';

const json = z.record(z.string(), z.json());

const delivery = z.object({
  id: z.string().min(1),
  type: z.string(),
  time: z.string().optional(),
  detail: json,
  event: json.default({}),
});

type Delivery = z.output<typeof delivery>;

const output = z.object({
  id: z.string().meta({ description: 'The Zendesk event id.' }),
  type: z.string().meta({ description: 'The event type, such as ticket.created.' }),
  time: z.string().optional(),
  detail: json.meta({
    description: 'The ticket, user or organization as it is now. Zendesk sends ids as strings.',
  }),
  event: json.meta({ description: 'What changed, as the event type defines it.' }),
  isPublic: z
    .boolean()
    .optional()
    .meta({ description: 'ticketCommentAdded: false for an internal note.' }),
  tagsAdded: z
    .array(z.string())
    .optional()
    .meta({ description: 'ticketTagAdded and userTagAdded.' }),
});

type Output = z.output<typeof output>;

const webhookOutput = z.object({ webhook: z.looseObject({ id: z.string().optional() }) });

const secretOutput = z.object({
  signing_secret: z.looseObject({ secret: z.string().optional() }),
});

function verifySignature(body: string, headers: Headers, secret: string) {
  const signature = headers.get('x-zendesk-webhook-signature');
  const timestamp = headers.get('x-zendesk-webhook-signature-timestamp');

  if (!signature || !timestamp) throw new Error('Zendesk webhook signature headers are missing.');

  const expected = createHmac('sha256', secret).update(`${timestamp}${body}`).digest();
  const received = Buffer.from(signature, 'base64');

  if (received.length !== expected.length || !timingSafeEqual(expected, received)) {
    throw new Error('Zendesk webhook signature is invalid.');
  }
}

async function deleteWebhook(client: ZendeskClient, webhookId: string) {
  try {
    await client.json({ method: 'DELETE', path: `/api/v2/webhooks/${webhookId}` });
  } catch (error) {
    if (!(error instanceof ZendeskError && error.status === 404)) throw error;
  }
}

function sameId(value: unknown, id: number | undefined) {
  return id === undefined || String(value) === String(id);
}

function base(value: Delivery): Output {
  return {
    id: value.id,
    type: value.type.slice(prefix.length),
    time: value.time,
    detail: value.detail,
    event: value.event,
  };
}

function webhookTrigger<const TSlug extends string, TInput extends z.ZodObject>({
  slug,
  description,
  events,
  input,
  data = base,
  matches,
}: {
  slug: TSlug;
  description: string;
  events: readonly string[];
  input: TInput;
  data?: (value: Delivery) => Output;
  matches?: (value: Delivery, input: z.output<TInput>) => boolean;
}) {
  const subscriptions = events.map((event) => `${prefix}${event}`);

  return defineWebhookTrigger({
    slug,
    description: `${description} Registers its own Zendesk webhook; deliveries are checked against its signing secret.`,
    type: 'webhook',
    input,
    output,
    async onEnable({ client, webhookUrl }) {
      const { webhook } = await client.data(webhookOutput, {
        method: 'POST',
        path: '/api/v2/webhooks',
        body: {
          webhook: {
            name: `FrogBot ${slug}`,
            status: 'active',
            endpoint: webhookUrl,
            http_method: 'POST',
            request_format: 'json',
            subscriptions,
          },
        },
      });

      if (!webhook.id) throw new Error(`Zendesk did not return an id for the ${slug} webhook.`);

      const webhookId = webhook.id;
      let secret: string | undefined;

      try {
        secret = (
          await client.data(secretOutput, { path: `/api/v2/webhooks/${webhookId}/signing_secret` })
        ).signing_secret.secret;
      } catch (error) {
        await deleteWebhook(client, webhookId);
        throw error;
      }

      if (!secret) {
        await deleteWebhook(client, webhookId);
        throw new Error(`Zendesk did not return a signing secret for the ${slug} webhook.`);
      }

      return { webhookId, secret };
    },
    async onDisable({ client, state }) {
      await deleteWebhook(client, state.webhookId);
    },
    async run({ input: filters, req, state }) {
      if (!req.text) throw new Error('Zendesk webhook raw body is unavailable.');

      const body = await req.text();

      verifySignature(body, req.headers, state.secret);

      const value = delivery.parse(JSON.parse(body));

      if (!subscriptions.includes(value.type)) return [];
      if (matches && !matches(value, filters)) return [];

      return [{ dedupeKey: value.id, data: data(value) }];
    },
  });
}

const organizationFilter = zendeskId('Organization ID')
  .optional()
  .meta({ description: 'Only tickets of this organization.' });

const ticketEvents = [
  'agent_assignment_changed',
  'brand_changed',
  'comment_added',
  'custom_field_changed',
  'custom_status_changed',
  'description_changed',
  'email_ccs_changed',
  'external_id_changed',
  'followers_changed',
  'form_changed',
  'group_assignment_changed',
  'marked_as_spam',
  'merged',
  'next_sla_breach_changed',
  'organization_changed',
  'priority_changed',
  'problem_link_changed',
  'requester_changed',
  'schedule_changed',
  'sla_policy_changed',
  'ola_policy_changed',
  'soft_deleted',
  'status_changed',
  'subject_changed',
  'submitter_changed',
  'tags_changed',
  'task_due_at_changed',
  'type_changed',
  'undeleted',
].map((event) => `ticket.${event}`);

const strings = z.array(z.string()).catch([]);

export const ticketCreated = webhookTrigger({
  slug: 'ticketCreated',
  description: 'Emit each new ticket.',
  events: ['ticket.created'],
  input: z.object({ organizationId: organizationFilter }),
  matches: (value, input) => sameId(value.detail.organization_id, input.organizationId),
});

export const ticketUpdated = webhookTrigger({
  slug: 'ticketUpdated',
  description:
    'Emit each change to a ticket: a field, its status, assignee or tags, a comment, a merge, spam, or a delete or restore. One update can emit several events.',
  events: ticketEvents,
  input: z.object({
    organizationId: organizationFilter,
    ticketId: zendeskId('Ticket ID').optional().meta({ description: 'Only this ticket.' }),
  }),
  matches: (value, input) =>
    sameId(value.detail.organization_id, input.organizationId) &&
    sameId(value.detail.id, input.ticketId),
});

export const ticketTagAdded = webhookTrigger({
  slug: 'ticketTagAdded',
  description: 'Emit when tags are added to a ticket; removals alone emit nothing.',
  events: ['ticket.tags_changed'],
  input: z.object({
    tag: z.string().min(1).optional().meta({ description: 'Only when this tag is added.' }),
  }),
  data: (value) => ({ ...base(value), tagsAdded: strings.parse(value.event.tags_added) }),
  matches: (value, input) => {
    const added = strings.parse(value.event.tags_added);

    return added.length > 0 && (!input.tag || added.includes(input.tag));
  },
});

export const ticketCommentAdded = webhookTrigger({
  slug: 'ticketCommentAdded',
  description: 'Emit each comment added to a ticket, public reply or internal note.',
  events: ['ticket.comment_added'],
  input: z.object({
    organizationId: organizationFilter,
    ticketId: zendeskId('Ticket ID').optional().meta({ description: 'Only this ticket.' }),
  }),
  data: (value) => ({
    ...base(value),
    isPublic:
      z.object({ comment: z.object({ is_public: z.boolean() }) }).safeParse(value.event).data
        ?.comment.is_public ?? false,
  }),
  matches: (value, input) =>
    sameId(value.detail.organization_id, input.organizationId) &&
    sameId(value.detail.id, input.ticketId),
});

export const organizationCreated = webhookTrigger({
  slug: 'organizationCreated',
  description: 'Emit each new organization.',
  events: ['organization.created'],
  input: z.object({}),
});

export const userCreated = webhookTrigger({
  slug: 'userCreated',
  description: 'Emit each new user.',
  events: ['user.created'],
  input: z.object({
    role: z
      .enum(['end-user', 'agent', 'admin'])
      .optional()
      .meta({ description: 'Only users with this role.' }),
  }),
  matches: (value, input) => !input.role || value.detail.role === input.role,
});

export const userTagAdded = webhookTrigger({
  slug: 'userTagAdded',
  description: 'Emit when tags are added to a user; removals alone emit nothing.',
  events: ['user.tags_changed'],
  input: z.object({}),
  data: (value) => ({ ...base(value), tagsAdded: tagsAddedToUser(value) }),
  matches: (value) => tagsAddedToUser(value).length > 0,
});

function tagsAddedToUser(value: Delivery) {
  return (
    z.object({ added: z.object({ tags: strings }) }).safeParse(value.event).data?.added.tags ?? []
  );
}
