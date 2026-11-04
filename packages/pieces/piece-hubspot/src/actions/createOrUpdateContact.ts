import { z } from 'zod';

import { signal } from '../client.js';
import { defineAction } from '../define.js';
import { format } from '../objects.js';
import { crmRecord } from '../records.js';
import { objectProperties } from './crud.js';

export const createOrUpdateContact = defineAction({
  slug: 'createOrUpdateContact',
  description:
    "Update the contact with this email, or create one when there is none. Returns HubSpot's created or updated contact.",
  input: z.object({
    email: z.string().min(1).meta({ label: 'Contact email' }),
    objectProperties,
  }),
  output: crmRecord,
  idempotent: false,
  async run({ client, input, req }) {
    const properties = format(input.objectProperties, false);
    const found = await client.request(
      z.object({ results: z.array(z.object({ id: z.string() })) }),
      {
        method: 'POST',
        path: '/crm/v3/objects/contacts/search',
        body: {
          limit: 1,
          filterGroups: [
            { filters: [{ propertyName: 'email', operator: 'EQ', value: input.email }] },
          ],
        },
        signal: signal(req),
      },
    );

    const existing = found.results[0];

    return existing
      ? client.request(crmRecord, {
          method: 'PATCH',
          path: `/crm/v3/objects/contacts/${existing.id}`,
          body: { properties },
          signal: signal(req),
        })
      : client.request(crmRecord, {
          method: 'POST',
          path: '/crm/v3/objects/contacts',
          body: { properties: { ...properties, email: input.email } },
          signal: signal(req),
        });
  },
});
