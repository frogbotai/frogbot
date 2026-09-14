import { z } from 'zod';

export const fieldsSchema = z.record(z.string(), z.unknown());
export const recordSchema = z
  .object({
    id: z.string(),
    createdTime: z.string().optional(),
    fields: fieldsSchema,
  })
  .passthrough();
export const fieldSchema = z
  .object({
    id: z.string().optional(),
    name: z.string(),
    type: z.string(),
    description: z.string().optional(),
    options: z.unknown().optional(),
  })
  .passthrough();
export const tableSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    primaryFieldId: z.string().optional(),
    fields: z.array(fieldSchema),
    views: z
      .array(
        z.object({ id: z.string(), name: z.string(), type: z.string().optional() }).passthrough(),
      )
      .optional(),
  })
  .passthrough();
export const baseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    permissionLevel: z.string().optional(),
    workspaceId: z.string().optional(),
  })
  .passthrough();
export const commentSchema = z
  .object({
    id: z.string(),
    text: z.string(),
    createdTime: z.string(),
    lastUpdatedTime: z.string().nullable().optional(),
    parentCommentId: z.string().optional(),
  })
  .passthrough();

export const selectionSchema = {
  baseId: z.string().min(1).meta({ label: 'Base' }),
  tableId: z.string().min(1).meta({ label: 'Table' }),
};
