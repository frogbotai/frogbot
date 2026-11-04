import { z } from 'zod';

import { signal } from '../client.js';
import { defineAction } from '../define.js';
import { workflowOptions } from './options.js';

export const addContactToWorkflow = defineAction({
  slug: 'addContactToWorkflow',
  description:
    "Enroll the contact with this email in a contact workflow. The workflow must allow API enrollment; HubSpot's v4 workflows API has no enrollment endpoint, so this uses the v2 one.",
  input: z.object({
    workflowId: z
      .union([z.number().int().positive(), z.string().regex(/^\d+$/).transform(Number)])
      .meta({ label: 'Workflow', description: "The workflow's legacy (v2/v3) ID." }),
    email: z.email().meta({ label: "Contact's email" }),
  }),
  output: z.object({ workflowId: z.number(), email: z.string(), enrolled: z.literal(true) }),
  idempotent: false,
  options: { workflowId: workflowOptions },
  async run({ client, input, req }) {
    await client.json({
      method: 'POST',
      path: `/automation/v2/workflows/${input.workflowId}/enrollments/contacts/${encodeURIComponent(input.email)}`,
      signal: signal(req),
    });

    return { workflowId: input.workflowId, email: input.email, enrolled: true as const };
  },
});

const status = z.object({
  subscriptionId: z.coerce.string(),
  subscriptionName: z.string().optional(),
  status: z.string(),
  channel: z.string(),
  timestamp: z.string().optional(),
});

export const removeEmailSubscription = defineAction({
  slug: 'removeEmailSubscription',
  description:
    'Unsubscribe an email address from every email subscription type, through the v4 communication preferences API.',
  input: z.object({ email: z.email().meta({ label: 'Email' }) }),
  output: z.object({ results: z.array(status) }),
  idempotent: false,
  run({ client, input, req }) {
    return client.request(z.object({ results: z.array(status) }), {
      method: 'POST',
      path: `/communication-preferences/v4/statuses/${encodeURIComponent(input.email)}/unsubscribe-all`,
      query: { channel: 'EMAIL' },
      signal: signal(req),
    });
  },
});
