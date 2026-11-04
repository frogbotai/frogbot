import { z } from 'zod';

import { zendeskBody } from '../body.js';
import { signal } from '../client.js';
import { zendeskId } from '../config.js';
import { defineAction } from '../define.js';
import { organization } from '../records.js';

const organizationOutput = z.object({ organization });

const organizationFields = {
  details: z.string().optional(),
  notes: z.string().optional(),
  externalId: z.string().optional(),
  groupId: zendeskId('Group ID').optional().meta({
    description: 'New tickets from the organization go to this group.',
  }),
  domainNames: z
    .array(z.string().min(1))
    .optional()
    .meta({ description: 'Users with these email domains join the organization.' }),
  tags: z.array(z.string().min(1)).optional(),
  sharedTickets: z
    .boolean()
    .optional()
    .meta({ description: 'Members can see each other’s tickets.' }),
  sharedComments: z
    .boolean()
    .optional()
    .meta({ description: 'Members can comment on each other’s tickets.' }),
  organizationFields: z
    .record(z.string(), z.json())
    .optional()
    .meta({ description: 'Custom field values by key, from listOrganizationFields.' }),
};

export const createOrganization = defineAction({
  slug: 'createOrganization',
  description: 'Create an organization. Its name must be unique.',
  input: z.object({ name: z.string().min(1), ...organizationFields }),
  output: organizationOutput,
  idempotent: false,
  run: ({ client, input, req }) =>
    client.data(organizationOutput, {
      method: 'POST',
      path: '/api/v2/organizations',
      body: { organization: zendeskBody(input) },
      signal: signal(req),
    }),
});

export const updateOrganization = defineAction({
  slug: 'updateOrganization',
  description:
    'Update an organization. Only the fields given change; tags and domains replace the existing ones.',
  input: z.object({
    organizationId: zendeskId('Organization ID'),
    name: z.string().min(1).optional(),
    ...organizationFields,
  }),
  output: organizationOutput,
  idempotent: true,
  run: ({ client, input, req }) =>
    client.data(organizationOutput, {
      method: 'PUT',
      path: `/api/v2/organizations/${input.organizationId}`,
      body: { organization: zendeskBody(input, ['organizationId']) },
      signal: signal(req),
    }),
});
