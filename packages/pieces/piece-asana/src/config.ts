import { z } from 'zod';

/** A personal access token, or the access token from an Asana sign-in. Both are bearer tokens. */
export const asanaAuth = z.object({
  accessToken: z.string().min(1).meta({ label: 'Access token', secret: true }),
});

export type AsanaAuth = z.output<typeof asanaAuth>;

export const gid = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, `${label} must be an Asana gid, such as 1203456789012345.`)
    .meta({ label });
