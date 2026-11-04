import { z } from 'zod';

import { type HubSpotClient, signal } from '../client.js';
import { objectType, recordId } from '../config.js';
import { defineAction } from '../define.js';
import { associationLabel } from '../records.js';
import { associationTypeOptions, objectTypeOptions, toRecordOptions } from './options.js';

const batchSize = 100;

const typeId = z
  .union([z.number().int(), z.string().regex(/^\d+$/).transform(Number)])
  .meta({ label: 'Type of the association', description: 'The association type ID.' });

const shape = {
  fromObjectType: objectType.meta({ label: 'From object type' }),
  fromObjectId: recordId('From object ID'),
  toObjectType: objectType.meta({ label: 'To object type' }),
  associationType: typeId,
  toObjectIds: z.array(recordId('To object ID')).min(1).meta({ label: 'To object IDs' }),
};

const options = {
  fromObjectType: objectTypeOptions,
  toObjectType: objectTypeOptions,
  associationType: associationTypeOptions,
  toObjectIds: toRecordOptions,
};

const labels = z.object({ results: z.array(associationLabel) });

const batchError = z.object({ message: z.string(), category: z.string().optional() });

const batchErrors = z.array(batchError).optional().default([]);

type Input = {
  fromObjectType: string;
  fromObjectId: string;
  toObjectType: string;
  associationType: number;
  toObjectIds: string[];
};

async function category(client: HubSpotClient, input: Input, abort?: AbortSignal) {
  const found = await client.request(labels, {
    path: `/crm/associations/v4/${input.fromObjectType}/${input.toObjectType}/labels`,
    signal: abort,
  });

  const type = found.results.find((label) => label.typeId === input.associationType);

  if (!type) {
    throw new Error(
      `Association type ${input.associationType} not found for ${input.fromObjectType} to ${input.toObjectType}.`,
    );
  }

  return type.category;
}

function batches(input: Input, associationCategory: string) {
  const inputs = input.toObjectIds.map((id) => ({
    from: { id: input.fromObjectId },
    to: { id },
    types: [{ associationCategory, associationTypeId: input.associationType }],
  }));

  return Array.from({ length: Math.ceil(inputs.length / batchSize) }, (_, index) =>
    inputs.slice(index * batchSize, (index + 1) * batchSize),
  );
}

const createdAssociation = z.object({
  fromObjectId: z.coerce.string(),
  toObjectId: z.coerce.string(),
  labels: z.array(z.string()).optional().default([]),
});

const created = z.object({
  results: z.array(createdAssociation).optional().default([]),
  errors: batchErrors,
});

export const createAssociations = defineAction({
  slug: 'createAssociations',
  description:
    'Associate one record with up to many records of another object type, with an association type (label).',
  input: z.object(shape),
  output: z.object({
    totalAssociations: z.number(),
    batchCount: z.number(),
    results: z.array(createdAssociation),
    errors: z.array(batchError),
  }),
  idempotent: false,
  options,
  async run({ client, input, req }) {
    const chunks = batches(input, await category(client, input, signal(req)));
    const responses = [];

    for (const inputs of chunks) {
      responses.push(
        await client.request(created, {
          method: 'POST',
          path: `/crm/v4/associations/${input.fromObjectType}/${input.toObjectType}/batch/create`,
          body: { inputs },
          signal: signal(req),
        }),
      );
    }

    return {
      totalAssociations: input.toObjectIds.length,
      batchCount: chunks.length,
      results: responses.flatMap((response) => response.results),
      errors: responses.flatMap((response) => response.errors),
    };
  },
});

export const removeAssociations = defineAction({
  slug: 'removeAssociations',
  description:
    'Remove one association type (label) between a record and records of another object type. Removing the unlabeled type removes every label.',
  input: z.object(shape),
  output: z.object({
    success: z.literal(true),
    totalAssociations: z.number(),
    batchCount: z.number(),
  }),
  idempotent: false,
  options,
  async run({ client, input, req }) {
    const chunks = batches(input, await category(client, input, signal(req)));

    for (const inputs of chunks) {
      await client.json({
        method: 'POST',
        path: `/crm/v4/associations/${input.fromObjectType}/${input.toObjectType}/batch/labels/archive`,
        body: { inputs },
        signal: signal(req),
      });
    }

    return {
      success: true as const,
      totalAssociations: input.toObjectIds.length,
      batchCount: chunks.length,
    };
  },
});

const associationsPage = z.object({
  results: z.array(
    z.object({ toObjectId: z.coerce.string(), associationTypes: z.array(associationLabel) }),
  ),
  paging: z.object({ next: z.object({ after: z.string() }).optional() }).optional(),
});

export const findAssociations = defineAction({
  slug: 'findAssociations',
  description: "Read every association from one record to an object type, with each one's labels.",
  input: z.object({
    fromObjectId: shape.fromObjectId,
    fromObjectType: shape.fromObjectType,
    toObjectType: shape.toObjectType,
  }),
  output: z.object({ results: associationsPage.shape.results }),
  idempotent: true,
  options: { fromObjectType: objectTypeOptions, toObjectType: objectTypeOptions },
  async run({ client, input, req }) {
    const results: z.output<typeof associationsPage>['results'] = [];
    let after: string | undefined;

    do {
      const page = await client.request(associationsPage, {
        path: `/crm/v4/objects/${input.fromObjectType}/${input.fromObjectId}/associations/${input.toObjectType}`,
        query: { limit: 500, after },
        signal: signal(req),
      });

      results.push(...page.results);
      after = page.paging?.next?.after;
    } while (after);

    return { results };
  },
});
