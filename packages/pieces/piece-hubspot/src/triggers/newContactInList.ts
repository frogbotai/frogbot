import { z } from 'zod';

import { additionalPropertiesToRetrieve } from '../actions/crud.js';
import { signal } from '../client.js';
import { recordId } from '../config.js';
import { definePollingTrigger } from '../define.js';
import { contacts, retrieve } from '../objects.js';
import { cursorPage } from '../pagination.js';
import { crmRecord, listMember } from '../records.js';
import { pollWindow, schedule } from './poll.js';

const maxPages = 100;
const readBatch = 100;

const output = crmRecord.extend({ membershipTimestamp: z.string() });

export const newContactInList = definePollingTrigger({
  slug: 'newContactInList',
  description:
    'Emit each contact added to a list. Each poll pages through the list in the order members were added, so a list over 10,000 members is only partly watched.',
  type: 'polling',
  schedule,
  input: z.object({ listId: recordId('List ID'), additionalPropertiesToRetrieve }),
  output,
  run({ client, input, cursor, req }) {
    return pollWindow(cursor, async (floor) => {
      const members: z.output<typeof listMember>[] = [];
      let after: string | undefined;

      for (let page = 0; page < maxPages; page++) {
        const result = await client.request(cursorPage(listMember), {
          path: `/crm/v3/lists/${input.listId}/memberships/join-order`,
          query: { limit: 100, after },
          signal: signal(req),
        });

        members.push(...result.results);

        if (result.nextCursor === null) break;

        after = result.nextCursor;
      }

      const added = members.filter(
        (member) => Date.parse(member.membershipTimestamp ?? '') > floor,
      );

      const items = [];

      for (let index = 0; index < added.length; index += readBatch) {
        const batch = added.slice(index, index + readBatch);
        const read = await client.request(z.object({ results: z.array(crmRecord) }), {
          method: 'POST',
          path: '/crm/v3/objects/contacts/batch/read',
          body: {
            properties: retrieve(contacts, input),
            inputs: batch.map((member) => ({ id: member.recordId })),
          },
          signal: signal(req),
        });

        for (const contact of read.results) {
          const membershipTimestamp = batch.find(
            (member) => member.recordId === contact.id,
          )?.membershipTimestamp;

          if (membershipTimestamp) {
            items.push({
              id: contact.id,
              epoch: Date.parse(membershipTimestamp),
              event: { ...contact, membershipTimestamp },
            });
          }
        }
      }

      return items;
    });
  },
});
