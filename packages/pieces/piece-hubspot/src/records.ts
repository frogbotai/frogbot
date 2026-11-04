import { z } from 'zod';

const timestamp = z.string().meta({ description: 'ISO 8601.' });

export const crmRecord = z.object({
  id: z.string(),
  properties: z.record(z.string(), z.string().nullable()),
  createdAt: timestamp.optional(),
  updatedAt: timestamp.optional(),
  archived: z.boolean().optional(),
  associations: z
    .record(
      z.string(),
      z.object({ results: z.array(z.object({ id: z.string(), type: z.string() })) }),
    )
    .optional()
    .meta({
      description:
        'The first page of each requested association, keyed by object type. Use listAssociations for the rest.',
    }),
});

export const associationLabel = z.object({
  category: z.string(),
  typeId: z.number(),
  label: z.string().nullable().optional(),
});

export const owner = z.object({
  id: z.string(),
  email: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  userId: z.number().nullable().optional(),
  type: z.string().optional(),
  archived: z.boolean().optional(),
  createdAt: timestamp.optional(),
  updatedAt: timestamp.optional(),
  teams: z
    .array(z.object({ id: z.string(), name: z.string(), primary: z.boolean().optional() }))
    .optional(),
});

export const pipelineStage = z.object({
  id: z.string(),
  label: z.string(),
  displayOrder: z.number(),
  archived: z.boolean().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  createdAt: timestamp.optional(),
  updatedAt: timestamp.optional(),
});

export const pipeline = z.object({
  id: z.string(),
  label: z.string(),
  displayOrder: z.number(),
  archived: z.boolean().optional(),
  stages: z.array(pipelineStage),
  createdAt: timestamp.optional(),
  updatedAt: timestamp.optional(),
});

export const property = z.object({
  name: z.string(),
  label: z.string(),
  type: z.string(),
  fieldType: z.string(),
  description: z.string().optional(),
  groupName: z.string().optional(),
  hidden: z.boolean().optional(),
  calculated: z.boolean().optional(),
  hubspotDefined: z.boolean().optional(),
  referencedObjectType: z.string().optional(),
  options: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        displayOrder: z.number().optional(),
        hidden: z.boolean().optional(),
      }),
    )
    .optional(),
  modificationMetadata: z
    .object({
      archivable: z.boolean(),
      readOnlyDefinition: z.boolean(),
      readOnlyValue: z.boolean(),
    })
    .partial()
    .optional(),
});

export const list = z.object({
  listId: z.string(),
  name: z.string(),
  objectTypeId: z.string().meta({ description: '0-1 for contacts, 0-2 for companies.' }),
  processingType: z.string().meta({ description: 'MANUAL, SNAPSHOT or DYNAMIC.' }),
  processingStatus: z.string().optional(),
  createdAt: timestamp.optional(),
  updatedAt: timestamp.optional(),
  additionalProperties: z
    .record(z.string(), z.union([z.string(), z.number()]).transform(String))
    .optional()
    .meta({ description: 'Such as hs_list_size.' }),
});

export const listMember = z.object({
  recordId: z.string(),
  membershipTimestamp: timestamp.optional(),
});
