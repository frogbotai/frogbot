import { z } from 'zod';

import { signal } from '../client.js';
import { defineAction } from '../define.js';
import { listOutput, listPage, pageInput } from '../pagination.js';

const contact = z
  .object({
    id: z.string(),
    displayName: z.string().nullish(),
    givenName: z.string().nullish(),
    surname: z.string().nullish(),
    emailAddresses: z
      .array(z.object({ name: z.string().nullish(), address: z.string().nullish() }))
      .nullish(),
    businessPhones: z.array(z.string()).nullish(),
    mobilePhone: z.string().nullish(),
    companyName: z.string().nullish(),
    jobTitle: z.string().nullish(),
    lastModifiedDateTime: z.string().nullish(),
  })
  .passthrough();

export const listContacts = defineAction({
  slug: 'listContacts',
  description: 'List one page of contacts in the default contacts folder.',
  input: z.object(pageInput),
  output: listOutput(contact),
  idempotent: true,
  async run({ client, input, req }) {
    return listPage(client, contact, {
      path: `${client.mailbox}/contacts`,
      limit: input.limit,
      cursor: input.cursor,
      signal: signal(req),
    });
  },
});
