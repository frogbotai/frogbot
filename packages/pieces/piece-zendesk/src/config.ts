import { z } from 'zod';

/** An API token, sent as Basic `<email>/token:<apiToken>`. Exports need an admin's token. */
export const zendeskAuth = z.object({
  subdomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9][a-z0-9-]*$/,
      'Subdomain must be the first part of your Zendesk address, such as acme for acme.zendesk.com.',
    )
    .meta({ label: 'Subdomain', description: 'acme for https://acme.zendesk.com.' }),
  email: z.string().trim().min(1).meta({ label: 'Email', description: 'The token owner’s email.' }),
  apiToken: z.string().min(1).meta({ label: 'API token', secret: true }),
});

export type ZendeskAuth = z.output<typeof zendeskAuth>;

export const zendeskId = (label: string) =>
  z.number().int().positive(`${label} must be a Zendesk id, such as 35436.`).meta({ label });
