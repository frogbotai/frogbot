import type { PieceActionDefinition } from 'frogbot/pieces';
import { z } from 'zod';

import { type HubSpotClient, signal } from '../client.js';
import { defineAction } from '../define.js';
import { compact, type CrmObject, format, type Option, retrieve, type Values } from '../objects.js';
import { crmRecord } from '../records.js';

const searchLimit = 200;

export const propertyName = z.string().regex(/^[\w-]+$/, 'Use a HubSpot property internal name.');

const propertyValue = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]);

export const objectProperties = z.record(propertyName, propertyValue).optional().meta({
  label: 'Object properties',
  description:
    "Property values by internal name. An array becomes HubSpot's semicolon-separated multi-select value. listProperties lists the names.",
});

export const additionalPropertiesToRetrieve = z.array(propertyName).optional().meta({
  label: 'Additional properties to retrieve',
  description: 'Returned with the default properties.',
});

function getRecord(
  client: HubSpotClient,
  object: CrmObject,
  input: Values,
  id: string,
  abort?: AbortSignal,
) {
  return client.request(crmRecord, {
    path: `/crm/v3/objects/${object.objectType(input)}/${id}`,
    query: { properties: retrieve(object, input) },
    signal: abort,
  });
}

type Dropdowns<TInput extends z.ZodType> = PieceActionDefinition<
  TInput,
  typeof crmRecord,
  Record<string, never>,
  HubSpotClient
>['options'];

function fieldOptions<TInput extends z.ZodType>(
  _input: TInput,
  options: Record<string, Option>,
): Dropdowns<TInput> {
  return options as Dropdowns<TInput>;
}

export type Named = (input: Values) => Record<string, unknown>;

/** Creates a record, then reads it back as upstream does. */
export function createAction<
  const TSlug extends string,
  TObject extends z.ZodRawShape,
  TFields extends z.ZodRawShape,
>({
  slug,
  description,
  object,
  fields,
  named,
  options,
}: {
  slug: TSlug;
  description: string;
  object: CrmObject<TObject>;
  fields: TFields;
  named?: Named;
  options?: Record<string, Option>;
}) {
  const input = z.object({
    ...object.input,
    ...fields,
    objectProperties,
    additionalPropertiesToRetrieve,
  });

  return defineAction({
    slug,
    description,
    input,
    output: crmRecord,
    idempotent: false,
    options: fieldOptions(input, {
      ...object.options,
      ...options,
      additionalPropertiesToRetrieve: object.properties,
    }),
    async run({ client, input: parsed, req }) {
      const values: Values = parsed;

      const created = await client.request(z.object({ id: z.string() }), {
        method: 'POST',
        path: `/crm/v3/objects/${object.objectType(values)}`,
        body: {
          properties: {
            ...format(values.objectProperties as Values, false),
            ...compact(named?.(values) ?? {}),
          },
        },
        signal: signal(req),
      });

      return getRecord(client, object, values, created.id, signal(req));
    },
  });
}

/** Updates a record, then reads it back. */
export function updateAction<
  const TSlug extends string,
  TObject extends z.ZodRawShape,
  TId extends z.ZodRawShape,
  TFields extends z.ZodRawShape,
>({
  slug,
  description,
  object,
  id,
  fields,
  named,
  options,
}: {
  slug: TSlug;
  description: string;
  object: CrmObject<TObject>;
  id: TId;
  fields: TFields;
  named?: Named;
  options?: Record<string, Option>;
}) {
  const idField = Object.keys(id)[0];

  const input = z.object({
    ...object.input,
    ...id,
    ...fields,
    objectProperties,
    additionalPropertiesToRetrieve,
  });

  return defineAction({
    slug,
    description,
    input,
    output: crmRecord,
    idempotent: false,
    options: fieldOptions(input, {
      ...object.options,
      ...options,
      additionalPropertiesToRetrieve: object.properties,
    }),
    async run({ client, input: parsed, req }) {
      const values: Values = parsed;

      const updated = await client.request(z.object({ id: z.string() }), {
        method: 'PATCH',
        path: `/crm/v3/objects/${object.objectType(values)}/${String(values[idField])}`,
        body: {
          properties: {
            ...format(values.objectProperties as Values, true),
            ...compact(named?.(values) ?? {}),
          },
        },
        signal: signal(req),
      });

      return getRecord(client, object, values, updated.id, signal(req));
    },
  });
}

/** Gets a record by its ID field. */
export function getAction<
  const TSlug extends string,
  TObject extends z.ZodRawShape,
  TId extends z.ZodRawShape,
>({
  slug,
  description,
  object,
  id,
}: {
  slug: TSlug;
  description: string;
  object: CrmObject<TObject>;
  id: TId;
}) {
  const idField = Object.keys(id)[0];

  const input = z.object({
    ...object.input,
    ...id,
    additionalPropertiesToRetrieve,
  });

  return defineAction({
    slug,
    description,
    input,
    output: crmRecord,
    idempotent: true,
    options: fieldOptions(input, {
      ...object.options,
      additionalPropertiesToRetrieve: object.properties,
    }),
    run({ client, input: parsed, req }) {
      const values: Values = parsed;

      return getRecord(client, object, values, String(values[idField]), signal(req));
    },
  });
}

/** Searches with one or two equality filters, up to HubSpot's 200 a page. */
export function findAction<const TSlug extends string, TObject extends z.ZodRawShape>({
  slug,
  description,
  object,
}: {
  slug: TSlug;
  description: string;
  object: CrmObject<TObject>;
}) {
  const input = z.object({
    ...object.input,
    firstSearchPropertyName: propertyName.meta({ label: 'First search property name' }),
    firstSearchPropertyValue: z.string().meta({ label: 'First search property value' }),
    secondSearchPropertyName: propertyName
      .optional()
      .meta({ label: 'Second search property name' }),
    secondSearchPropertyValue: z
      .string()
      .optional()
      .meta({ label: 'Second search property value' }),
    additionalPropertiesToRetrieve,
  });

  return defineAction({
    slug,
    description,
    input,
    output: z.object({ total: z.number(), results: z.array(crmRecord) }),
    idempotent: true,
    options: fieldOptions(input, {
      ...object.options,
      firstSearchPropertyName: object.properties,
      secondSearchPropertyName: object.properties,
      additionalPropertiesToRetrieve: object.properties,
    }),
    run({ client, input: parsed, req }) {
      const values: Values = parsed;

      const search = values as {
        firstSearchPropertyName: string;
        firstSearchPropertyValue: string;
        secondSearchPropertyName?: string;
        secondSearchPropertyValue?: string;
      };

      const filters = [
        {
          propertyName: search.firstSearchPropertyName,
          operator: 'EQ',
          value: search.firstSearchPropertyValue,
        },
      ];

      if (search.secondSearchPropertyName && search.secondSearchPropertyValue) {
        filters.push({
          propertyName: search.secondSearchPropertyName,
          operator: 'EQ',
          value: search.secondSearchPropertyValue,
        });
      }

      return client.request(z.object({ total: z.number(), results: z.array(crmRecord) }), {
        method: 'POST',
        path: `/crm/v3/objects/${object.objectType(values)}/search`,
        body: {
          limit: searchLimit,
          properties: retrieve(object, values),
          filterGroups: [{ filters }],
        },
        signal: signal(req),
      });
    },
  });
}
