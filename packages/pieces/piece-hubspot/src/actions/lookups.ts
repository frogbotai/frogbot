import { z } from 'zod';

import { signal } from '../client.js';
import { recordId } from '../config.js';
import { defineAction } from '../define.js';
import { owner, pipelineStage } from '../records.js';

export const getOwnerByEmail = defineAction({
  slug: 'getOwnerByEmail',
  description: 'Get the owner (user) with this email, or null when there is none.',
  input: z.object({ email: z.email().meta({ label: 'Owner email' }) }),
  output: owner.nullable(),
  idempotent: true,
  async run({ client, input, req }) {
    const page = await client.request(z.object({ results: z.array(owner) }), {
      path: '/crm/v3/owners',
      query: { email: input.email, limit: 1 },
      signal: signal(req),
    });

    return page.results[0] ?? null;
  },
});

export const getOwnerById = defineAction({
  slug: 'getOwnerById',
  description: 'Get an owner (user) by owner ID.',
  input: z.object({ ownerId: recordId('Owner ID') }),
  output: owner,
  idempotent: true,
  run({ client, input, req }) {
    return client.request(owner, {
      path: `/crm/v3/owners/${input.ownerId}`,
      signal: signal(req),
    });
  },
});

const pipelinePart = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^[\w-]+$/, `${label} must be a HubSpot ID, such as default.`)
    .meta({ label });

export const getPipelineStageDetails = defineAction({
  slug: 'getPipelineStageDetails',
  description: "Get a deal or ticket pipeline stage's label, order and metadata.",
  input: z.object({
    objectType: z.enum(['deals', 'tickets']).meta({ label: 'Object type' }),
    pipelineId: pipelinePart('Pipeline ID'),
    stageId: pipelinePart('Stage ID'),
  }),
  output: pipelineStage,
  idempotent: true,
  run({ client, input, req }) {
    return client.request(pipelineStage, {
      path: `/crm/v3/pipelines/${input.objectType}/${input.pipelineId}/stages/${input.stageId}`,
      signal: signal(req),
    });
  },
});
