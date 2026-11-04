import { z } from 'zod';

import { additionalPropertiesToRetrieve, propertyName } from '../actions/crud.js';
import { type HubSpotClient, signal } from '../client.js';
import { definePollingTrigger } from '../define.js';
import {
  companies,
  contacts,
  type CrmObject,
  customObjects,
  deals,
  lineItems,
  products,
  retrieve,
  tasks,
  tickets,
  type Values,
} from '../objects.js';
import { crmRecord } from '../records.js';
import { type CrmRecord, type PollItem, pollSearch, schedule } from './poll.js';

const historyBatch = 50;

function recordTrigger<const TSlug extends string, TObject extends z.ZodRawShape>({
  slug,
  description,
  object,
  time,
}: {
  slug: TSlug;
  description: string;
  object: CrmObject<TObject>;
  time: 'created' | 'modified';
}) {
  const input = z.object({ ...object.input, additionalPropertiesToRetrieve });

  return definePollingTrigger({
    slug,
    description,
    type: 'polling',
    schedule,
    input,
    output: crmRecord,
    run({ client, input: values, cursor, req }) {
      return pollSearch(client, {
        cursor,
        objectType: object.objectType(values),
        timeProperty: object[time],
        properties: retrieve(object, values),
        signal: signal(req),
      });
    },
  });
}

const withHistory = z.object({
  results: z.array(
    crmRecord.extend({
      propertiesWithHistory: z
        .record(z.string(), z.array(z.object({ timestamp: z.string(), value: z.string() })))
        .optional(),
    }),
  ),
});

async function changes(
  client: HubSpotClient,
  args: { objectType: string; property: string; properties: string[]; signal?: AbortSignal },
  records: CrmRecord[],
): Promise<PollItem<CrmRecord>[]> {
  const items: PollItem<CrmRecord>[] = [];

  for (let index = 0; index < records.length; index += historyBatch) {
    const batch = records.slice(index, index + historyBatch);
    const read = await client.request(withHistory, {
      method: 'POST',
      path: `/crm/v3/objects/${args.objectType}/batch/read`,
      body: {
        properties: args.properties,
        propertiesWithHistory: [args.property],
        inputs: batch.map((record) => ({ id: record.id })),
      },
      signal: args.signal,
    });

    for (const { propertiesWithHistory, ...record } of read.results) {
      const latest = propertiesWithHistory?.[args.property]?.[0];

      if (latest) items.push({ id: record.id, epoch: Date.parse(latest.timestamp), event: record });
    }
  }

  return items;
}

function propertyChangeTrigger<const TSlug extends string, TObject extends z.ZodRawShape>({
  slug,
  description,
  object,
}: {
  slug: TSlug;
  description: string;
  object: CrmObject<TObject>;
}) {
  const input = z.object({
    ...object.input,
    propertyName: propertyName.meta({ label: 'Property name' }),
  });

  return definePollingTrigger({
    slug,
    description,
    type: 'polling',
    schedule,
    input,
    output: crmRecord,
    run({ client, input: parsed, cursor, req }) {
      const values: Values = parsed;
      const objectType = object.objectType(values);
      const property = String(values.propertyName);
      const properties = [property, object.modified];

      return pollSearch(client, {
        cursor,
        objectType,
        timeProperty: object.modified,
        properties,
        filters: [{ propertyName: property, operator: 'HAS_PROPERTY' }],
        items: (records) =>
          changes(client, { objectType, property, properties, signal: signal(req) }, records),
        signal: signal(req),
      });
    },
  });
}

export const newContact = recordTrigger({
  slug: 'newContact',
  description: 'Emit each new contact.',
  object: contacts,
  time: 'created',
});

export const newOrUpdatedContact = recordTrigger({
  slug: 'newOrUpdatedContact',
  description: 'Emit each contact that is created or changed.',
  object: contacts,
  time: 'modified',
});

export const newContactPropertyChange = propertyChangeTrigger({
  slug: 'newContactPropertyChange',
  description: 'Emit each contact whose chosen property changes.',
  object: contacts,
});

export const newCompany = recordTrigger({
  slug: 'newCompany',
  description: 'Emit each new company.',
  object: companies,
  time: 'created',
});

export const newOrUpdatedCompany = recordTrigger({
  slug: 'newOrUpdatedCompany',
  description: 'Emit each company that is created or changed.',
  object: companies,
  time: 'modified',
});

export const newCompanyPropertyChange = propertyChangeTrigger({
  slug: 'newCompanyPropertyChange',
  description: 'Emit each company whose chosen property changes.',
  object: companies,
});

export const newDeal = recordTrigger({
  slug: 'newDeal',
  description: 'Emit each new deal.',
  object: deals,
  time: 'created',
});

export const newDealPropertyChange = propertyChangeTrigger({
  slug: 'newDealPropertyChange',
  description: 'Emit each deal whose chosen property changes.',
  object: deals,
});

export const newTicket = recordTrigger({
  slug: 'newTicket',
  description: 'Emit each new ticket.',
  object: tickets,
  time: 'created',
});

export const newTicketPropertyChange = propertyChangeTrigger({
  slug: 'newTicketPropertyChange',
  description: 'Emit each ticket whose chosen property changes.',
  object: tickets,
});

export const newLineItem = recordTrigger({
  slug: 'newLineItem',
  description: 'Emit each new line item.',
  object: lineItems,
  time: 'created',
});

export const newOrUpdatedLineItem = recordTrigger({
  slug: 'newOrUpdatedLineItem',
  description: 'Emit each line item that is created or changed.',
  object: lineItems,
  time: 'modified',
});

export const newProduct = recordTrigger({
  slug: 'newProduct',
  description: 'Emit each new product.',
  object: products,
  time: 'created',
});

export const newOrUpdatedProduct = recordTrigger({
  slug: 'newOrUpdatedProduct',
  description: 'Emit each product that is created or changed.',
  object: products,
  time: 'modified',
});

export const newTask = recordTrigger({
  slug: 'newTask',
  description: 'Emit each new task.',
  object: tasks,
  time: 'created',
});

export const newCustomObject = recordTrigger({
  slug: 'newCustomObject',
  description: 'Emit each new record of a custom object.',
  object: customObjects,
  time: 'created',
});

export const newCustomObjectPropertyChange = propertyChangeTrigger({
  slug: 'newCustomObjectPropertyChange',
  description: 'Emit each custom object record whose chosen property changes.',
  object: customObjects,
});

const stageEntered = 'hs_v2_date_entered_current_stage';

export const dealStageUpdated = definePollingTrigger({
  slug: 'dealStageUpdated',
  description: 'Emit each deal that enters the chosen stage of a pipeline.',
  type: 'polling',
  schedule,
  input: z.object({
    pipelineId: z.string().min(1).meta({ label: 'Deal pipeline' }),
    stageId: z.string().min(1).meta({ label: 'Deal stage' }),
    additionalPropertiesToRetrieve,
  }),
  output: crmRecord,
  run({ client, input, cursor, req }) {
    return pollSearch(client, {
      cursor,
      objectType: 'deals',
      timeProperty: stageEntered,
      properties: retrieve(deals, input),
      filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: input.pipelineId },
        { propertyName: 'dealstage', operator: 'EQ', value: input.stageId },
      ],
      signal: signal(req),
    });
  },
});
