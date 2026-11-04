import { z } from 'zod';

import { type HubSpotClient, signal } from '../client.js';
import { recordId } from '../config.js';
import { defineAction } from '../define.js';
import { contactListOptions } from './options.js';

const input = z.object({
  listId: recordId('List ID').meta({
    description: 'A MANUAL or SNAPSHOT contact list; active lists manage their own members.',
  }),
  email: z.string().min(1).meta({ label: 'Contact email' }),
});

const membershipUpdate = z.object({
  recordsIdsAdded: z.array(z.string()).optional().default([]),
  recordIdsRemoved: z.array(z.string()).optional().default([]),
  recordIdsMissing: z.array(z.string()).optional().default([]),
});

const output = z.object({
  contactId: z.string(),
  recordsIdsAdded: z.array(z.string()),
  recordIdsRemoved: z.array(z.string()),
  recordIdsMissing: z.array(z.string()),
});

const found = z.object({ results: z.array(z.object({ id: z.string() })) });

async function contactId(client: HubSpotClient, email: string, abort?: AbortSignal) {
  const result = await client.request(found, {
    method: 'POST',
    path: '/crm/v3/objects/contacts/search',
    body: {
      limit: 1,
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
    },
    signal: abort,
  });

  const contact = result.results[0];

  if (!contact) throw new Error(`No contact with email '${email}' was found.`);

  return contact.id;
}

export const addContactToList = defineAction({
  slug: 'addContactToList',
  description: 'Add the contact with this email to a manual contact list.',
  input,
  output,
  idempotent: false,
  options: { listId: contactListOptions },
  async run({ client, input: values, req }) {
    const id = await contactId(client, values.email, signal(req));
    const result = await client.request(membershipUpdate, {
      method: 'PUT',
      path: `/crm/v3/lists/${values.listId}/memberships/add`,
      body: [id],
      signal: signal(req),
    });

    return { contactId: id, ...result };
  },
});

export const removeContactFromList = defineAction({
  slug: 'removeContactFromList',
  description:
    'Remove the contact with this email from a manual contact list. Throws when the contact was not a member.',
  input,
  output,
  idempotent: false,
  options: { listId: contactListOptions },
  async run({ client, input: values, req }) {
    const id = await contactId(client, values.email, signal(req));
    const result = await client.request(membershipUpdate, {
      method: 'PUT',
      path: `/crm/v3/lists/${values.listId}/memberships/remove`,
      body: [id],
      signal: signal(req),
    });

    if (result.recordIdsRemoved.length === 0) {
      throw new Error(
        `Contact with email '${values.email}' wasn't a member of list with id '${values.listId}'.`,
      );
    }

    return { contactId: id, ...result };
  },
});
