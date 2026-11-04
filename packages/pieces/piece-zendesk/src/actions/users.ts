import { z } from 'zod';

import { zendeskBody } from '../body.js';
import { signal } from '../client.js';
import { zendeskId } from '../config.js';
import { defineAction } from '../define.js';
import { user } from '../records.js';

const userId = zendeskId('User ID');
const userOutput = z.object({ user });

const userFields = {
  email: z.email().optional(),
  role: z.enum(['end-user', 'agent', 'admin']).optional(),
  customRoleId: zendeskId('Custom role ID').optional().meta({ description: 'For agents only.' }),
  organizationId: zendeskId('Organization ID').optional(),
  phone: z.string().optional(),
  alias: z.string().optional(),
  details: z.string().optional(),
  notes: z.string().optional(),
  externalId: z.string().optional(),
  timeZone: z.string().optional(),
  locale: z.string().optional(),
  signature: z.string().optional().meta({ description: 'For agents only.' }),
  defaultGroupId: zendeskId('Default group ID').optional(),
  ticketRestriction: z.enum(['organization', 'groups', 'assigned', 'requested']).optional(),
  verified: z.boolean().optional(),
  suspended: z.boolean().optional(),
  onlyPrivateComments: z.boolean().optional(),
  restrictedAgent: z.boolean().optional(),
  tags: z.array(z.string().min(1)).optional().meta({ description: 'Replaces the user’s tags.' }),
  userFields: z
    .record(z.string(), z.json())
    .optional()
    .meta({ description: 'Custom field values by key, from listUserFields.' }),
};

export const createUser = defineAction({
  slug: 'createUser',
  description: 'Create an end user, agent or admin.',
  input: z.object({
    name: z.string().min(1),
    ...userFields,
    organizationName: z
      .string()
      .optional()
      .meta({ description: 'An organization to create and add the user to.' }),
    skipVerifyEmail: z
      .boolean()
      .optional()
      .meta({ description: 'Don’t send the verification email.' }),
  }),
  output: userOutput,
  idempotent: false,
  run: ({ client, input, req }) =>
    client.data(userOutput, {
      method: 'POST',
      path: '/api/v2/users',
      body: {
        user: {
          ...zendeskBody(input, ['organizationName']),
          ...(input.organizationName ? { organization: { name: input.organizationName } } : {}),
        },
      },
      signal: signal(req),
    }),
});

export const updateUser = defineAction({
  slug: 'updateUser',
  description: 'Update a user. Only the fields given change.',
  input: z.object({ userId, name: z.string().min(1).optional(), ...userFields }),
  output: userOutput,
  idempotent: true,
  run: ({ client, input, req }) =>
    client.data(userOutput, {
      method: 'PUT',
      path: `/api/v2/users/${input.userId}`,
      body: { user: zendeskBody(input, ['userId']) },
      signal: signal(req),
    }),
});

export const deleteUser = defineAction({
  slug: 'deleteUser',
  description:
    'Delete a user. Zendesk keeps a deleted user’s tickets and marks the user inactive; it can’t be undone in the Zendesk UI.',
  input: z.object({ userId }),
  output: userOutput,
  idempotent: false,
  run: ({ client, input, req }) =>
    client.data(userOutput, {
      method: 'DELETE',
      path: `/api/v2/users/${input.userId}`,
      signal: signal(req),
    }),
});
