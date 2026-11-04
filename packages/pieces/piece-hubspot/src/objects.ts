import type { PieceOption } from 'frogbot/pieces';
import { z } from 'zod';

import {
  customObjectTypeOptions,
  customPropertyOptions,
  propertyOptions,
} from './actions/options.js';
import type { HubSpotClient } from './client.js';

export type Values = Record<string, unknown>;

export type Option = (args: { client: HubSpotClient; input: Values }) => Promise<PieceOption[]>;

/** A CRM object an action works on: its type, the input that picks it, and its default properties. */
export type CrmObject<TInput extends z.ZodRawShape = z.ZodRawShape> = {
  input: TInput;
  objectType(input: Values): string;
  defaults: readonly string[];
  properties: Option;
  options?: Record<string, Option>;
};

function standard(
  objectType: string,
  defaults: readonly string[],
): CrmObject<Record<never, never>> {
  return {
    input: {},
    objectType: () => objectType,
    defaults,
    properties: propertyOptions(objectType),
  };
}

export const contacts = standard('contacts', [
  'firstname',
  'lastname',
  'email',
  'company',
  'website',
  'mobilephone',
  'phone',
  'fax',
  'address',
  'city',
  'state',
  'zip',
  'salutation',
  'country',
  'jobtitle',
  'hs_createdate',
  'hs_email_domain',
  'hs_object_id',
  'lastmodifieddate',
  'hs_persona',
  'hs_language',
  'lifecyclestage',
  'createdate',
  'numemployees',
  'annualrevenue',
  'industry',
]);

export const companies = standard('companies', [
  'name',
  'domain',
  'industry',
  'about_us',
  'phone',
  'address',
  'address2',
  'city',
  'state',
  'zip',
  'country',
  'website',
  'type',
  'description',
  'founded_year',
  'hs_createdate',
  'hs_lastmodifieddate',
  'hs_object_id',
  'is_public',
  'timezone',
  'total_money_raised',
  'total_revenue',
  'owneremail',
  'ownername',
  'numberofemployees',
  'annualrevenue',
  'lifecyclestage',
  'createdate',
  'web_technologies',
]);

export const deals = standard('deals', [
  'dealtype',
  'dealname',
  'amount',
  'description',
  'closedate',
  'createdate',
  'num_associated_contacts',
  'hs_forecast_amount',
  'hs_forecast_probability',
  'hs_manual_forecast_category',
  'hs_next_step',
  'hs_object_id',
  'hs_lastmodifieddate',
  'hubspot_owner_id',
  'hubspot_team_id',
]);

export const tickets = standard('tickets', [
  'subject',
  'content',
  'source_type',
  'createdate',
  'hs_pipeline',
  'hs_pipeline_stage',
  'hs_resolution',
  'hs_ticket_category',
  'hs_ticket_id',
  'hs_ticket_priority',
  'hs_lastmodifieddate',
  'hubspot_owner_id',
  'hubspot_team_id',
]);

export const lineItems = standard('line_items', [
  'name',
  'description',
  'price',
  'quantity',
  'amount',
  'discount',
  'tax',
  'createdate',
  'hs_object_id',
  'hs_product_id',
  'hs_images',
  'hs_lastmodifieddate',
  'hs_line_item_currency_code',
  'hs_sku',
  'hs_url',
  'hs_cost_of_goods_sold',
  'hs_discount_percentage',
  'hs_term_in_months',
]);

export const products = standard('products', [
  'createdate',
  'description',
  'name',
  'price',
  'tax',
  'hs_lastmodifieddate',
]);

export const customObjects = {
  input: {
    customObjectType: z
      .string()
      .regex(/^2-\d+$/, 'customObjectType must be a custom object type ID, such as 2-3456789.')
      .meta({ label: 'Type of custom object', description: 'A type ID such as 2-3456789.' }),
  },
  objectType: (input: Values) => String(input.customObjectType),
  defaults: ['hs_object_id', 'hs_lastmodifieddate', 'hs_createdate'],
  properties: customPropertyOptions,
  options: { customObjectType: customObjectTypeOptions },
} satisfies CrmObject;

/** Joins arrays with `;`, stringifies the rest, and skips empty arrays on update. */
export function format(values: Values | undefined, skipEmpty: boolean) {
  const result: Record<string, string> = {};

  for (const [name, value] of Object.entries(values ?? {})) {
    if (Array.isArray(value)) {
      if (skipEmpty && value.length === 0) continue;

      result[name] = value.join(';');
    } else {
      result[name] = String(value);
    }
  }

  return result;
}

/** Keeps the named fields that were given. */
export function compact(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '',
    ),
  );
}

/** The default properties plus `additionalPropertiesToRetrieve`. */
export function retrieve(object: CrmObject, input: Values) {
  return [...object.defaults, ...((input.additionalPropertiesToRetrieve as string[]) ?? [])];
}
