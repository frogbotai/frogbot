import { z } from 'zod';

export const airtableAuth = z.object({
  personalAccessToken: z.string().min(1).meta({ label: 'Personal access token', secret: true }),
});
