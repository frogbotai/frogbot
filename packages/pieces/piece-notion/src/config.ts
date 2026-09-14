import { z } from 'zod';

export const notionAuth = z.object({
  accessToken: z.string().min(1).meta({ label: 'Access token', secret: true }),
});

export const notionId = z.string().trim().min(1);
export const databaseFields = z.record(z.string(), z.unknown());
