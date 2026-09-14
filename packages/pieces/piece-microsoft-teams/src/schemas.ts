import { z } from 'zod';

export const user = z
  .object({
    id: z.string(),
    displayName: z.string().nullish(),
    mail: z.string().nullish(),
    userPrincipalName: z.string().nullish(),
  })
  .passthrough();

export const member = z
  .object({
    id: z.string(),
    displayName: z.string().nullish(),
    email: z.string().nullish(),
    userId: z.string().nullish(),
  })
  .passthrough();

export const channel = z
  .object({
    id: z.string(),
    displayName: z.string(),
    description: z.string().nullish(),
    createdDateTime: z.string().nullish(),
    membershipType: z.string().nullish(),
    isArchived: z.boolean().nullish(),
  })
  .passthrough();

export const message = z
  .object({
    id: z.string(),
    createdDateTime: z.string().nullish(),
    lastModifiedDateTime: z.string().nullish(),
    chatId: z.string().nullish(),
    body: z.object({ content: z.string(), contentType: z.string() }).passthrough(),
  })
  .passthrough();

export const chat = z
  .object({
    id: z.string(),
    topic: z.string().nullish(),
    chatType: z.enum(['oneOnOne', 'group', 'meeting', 'unknownFutureValue']).nullish(),
    createdDateTime: z.string().nullish(),
    lastUpdatedDateTime: z.string().nullish(),
    members: z.array(member).optional(),
  })
  .passthrough();

export const transcript = z
  .object({ id: z.string(), createdDateTime: z.string().nullish() })
  .passthrough();
export const recording = z
  .object({ id: z.string(), createdDateTime: z.string().nullish() })
  .passthrough();
export type GraphPage<T> = {
  value: T[];
  '@odata.nextLink'?: string | undefined;
  '@odata.deltaLink'?: string | undefined;
};

export function page<T>(item: z.ZodType<T>): z.ZodType<GraphPage<T>> {
  return z
    .object({
      value: z.array(item),
      '@odata.nextLink': z.string().url().optional(),
      '@odata.deltaLink': z.string().url().optional(),
    })
    .passthrough();
}

export const searchResult = <T extends z.ZodType>(item: T) =>
  z.object({ found: z.boolean(), result: z.array(item) });
