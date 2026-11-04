import { z } from 'zod';

/** A service key, an existing private-app token, or the access token from a HubSpot sign-in. All are bearer tokens. */
export const hubspotAuth = z.object({
  accessToken: z.string().min(1).meta({ label: 'Access token', secret: true }),
});

export type HubSpotAuth = z.output<typeof hubspotAuth>;

export const standardObjectTypes = [
  'contacts',
  'companies',
  'deals',
  'tickets',
  'notes',
  'emails',
  'calls',
  'meetings',
  'tasks',
  'line_items',
  'products',
] as const;

/** A standard CRM object, or a custom object's type ID such as `2-3456789`. */
export const objectType = z
  .union([z.enum(standardObjectTypes), z.templateLiteral(['2-', z.number().int().nonnegative()])])
  .meta({
    label: 'Object type',
    description: `One of ${standardObjectTypes.join(', ')}, or a custom object type ID such as 2-3456789.`,
  });

export type ObjectType = z.output<typeof objectType>;

export const recordId = (label: string) =>
  z.string().trim().regex(/^\d+$/, `${label} must be a HubSpot ID, such as 51.`).meta({ label });
