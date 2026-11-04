import { z } from 'zod';

export const apiVersion = 'v68.0';

/** The REST API root every call goes under, on the connection's instance. */
export const dataRoot = `/services/data/${apiVersion}`;

const myDomain =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.my\.salesforce\.com$/;

/**
 * Where users sign in: `login.salesforce.com` for production, `test.salesforce.com` for a
 * sandbox, or a My Domain host such as `acme.my.salesforce.com`.
 */
export const loginHost = z
  .string()
  .trim()
  .toLowerCase()
  .refine(
    (host) =>
      host === 'login.salesforce.com' || host === 'test.salesforce.com' || myDomain.test(host),
    'Salesforce loginHost must be login.salesforce.com, test.salesforce.com or a My Domain host such as acme.my.salesforce.com.',
  )
  .default('login.salesforce.com');

export type SalesforceSettings = { loginHost?: string };

const https = z.url({ protocol: /^https$/ });

/** A Salesforce sign-in's access token, the org's instance URL and the user's identity URL. */
export const salesforceAuth = z.object({
  accessToken: z.string().min(1).meta({ label: 'Access token', secret: true }),
  instanceUrl: https.meta({
    label: 'Instance URL',
    description: 'The org the token belongs to, such as https://acme.my.salesforce.com.',
  }),
  identityUrl: https.optional().meta({
    label: 'Identity URL',
    description: "The sign-in's id URL, https://login.salesforce.com/id/<org ID>/<user ID>.",
  }),
});

export type SalesforceAuth = z.output<typeof salesforceAuth>;

/** An object's API name, such as `Account`, `Invoice__c` or `ns__Invoice__c`. */
export const objectName = z
  .string()
  .trim()
  .regex(/^[A-Za-z]\w*$/, 'Object must be a Salesforce API name, such as Account or Invoice__c.')
  .meta({ label: 'Object', description: 'The API name, such as Account or Invoice__c.' });

/** A field's API name, such as `Email` or `External_Id__c`. */
export const fieldName = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^[A-Za-z]\w*$/, `${label} must be a Salesforce field API name, such as Email.`)
    .meta({ label });

/** A 15- or 18-character Salesforce record ID. */
export const recordId = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/, `${label} must be a Salesforce record ID.`)
    .meta({ label });

/** Field values keyed by API name, for fields the action doesn't name. */
export const extraFields = z
  .record(z.string().regex(/^[A-Za-z]\w*$/), z.json())
  .optional()
  .meta({
    label: 'Other fields',
    description: 'More field values by API name, such as {"Title": "CFO"}.',
  });
