import { z } from 'zod';

export const user = z
  .object({
    accountId: z.string(),
    accountType: z.string().optional(),
    displayName: z.string().optional(),
    emailAddress: z.string().optional(),
    active: z.boolean().optional(),
  })
  .passthrough();

export const issue = z
  .object({
    id: z.string(),
    key: z.string(),
    self: z.string().optional(),
    fields: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const comment = z
  .object({
    id: z.string(),
    author: user.optional(),
    body: z.unknown(),
    renderedBody: z.string().optional(),
    created: z.string().optional(),
    updated: z.string().optional(),
  })
  .passthrough();

export const attachment = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String),
    filename: z.string(),
    mimeType: z.string().optional(),
    size: z.number().optional(),
    created: z.string().optional(),
    author: user.optional(),
    content: z.string().optional(),
  })
  .passthrough();

export const success = z.object({ success: z.literal(true) });

/** A linked-issue reference: `{ id }` for a numeric id, `{ key }` for a key. */
export function issueRef(value: string) {
  return /^\d+$/.test(value) ? { id: value } : { key: value };
}

export function issuePath(value: string, rest = '') {
  return `/issue/${encodeURIComponent(value)}${rest}`;
}

const changeValue = z
  .unknown()
  .transform((value) => (typeof value === 'string' ? value : null))
  .optional();

export const changelogItem = z
  .object({
    field: z.string(),
    fieldId: z.string().optional(),
    from: changeValue,
    fromString: changeValue,
    to: changeValue,
    toString: changeValue,
  })
  .passthrough();

export const changeHistory = z
  .object({
    id: z.string(),
    author: user.optional(),
    created: z.string(),
    items: z.array(changelogItem),
  })
  .passthrough();
