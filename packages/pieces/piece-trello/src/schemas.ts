import { z } from 'zod';

export const cardOutput = z
  .object({
    id: z.string(),
    name: z.string(),
    desc: z.string().optional(),
    idBoard: z.string().optional(),
    idList: z.string().optional(),
    due: z.string().nullable().optional(),
    dueComplete: z.boolean().optional(),
    dateLastActivity: z.string().optional(),
    url: z.string().optional(),
  })
  .passthrough();

export const attachmentOutput = z
  .object({
    id: z.string(),
    name: z.string(),
    url: z.string(),
    mimeType: z.string().optional(),
  })
  .passthrough();

export const emptyOutput = z.object({}).passthrough();
