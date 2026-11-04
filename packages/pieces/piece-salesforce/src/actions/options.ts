import type { PieceOption } from 'frogbot/pieces';
import { z } from 'zod';

import type { SalesforceClient } from '../client.js';
import { dataRoot } from '../config.js';
import { queryPage, soqlString } from '../records.js';

type Args = { client: SalesforceClient; input: Record<string, unknown> };

const apiName = /^[A-Za-z]\w*$/;
const id = /^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/;

function matching(value: unknown, pattern: RegExp) {
  return typeof value === 'string' && pattern.test(value.trim()) ? value.trim() : undefined;
}

async function soql(client: SalesforceClient, statement: string) {
  const page = await client.request(queryPage, {
    path: `${dataRoot}/query`,
    query: { q: statement },
  });

  return page.records;
}

const describedFields = z.object({
  fields: z.array(
    z.object({
      name: z.string(),
      label: z.string(),
      picklistValues: z.array(
        z.object({ label: z.string(), value: z.string(), active: z.boolean() }),
      ),
    }),
  ),
});

function describe(client: SalesforceClient, object: string) {
  return client.request(describedFields, { path: `${dataRoot}/sobjects/${object}/describe` });
}

const label = (value: unknown, fallback: string) =>
  typeof value === 'string' && value ? value : fallback;

/** The org's objects that can be queried, by label. */
export async function objectOptions({ client }: Args): Promise<PieceOption[]> {
  const result = await client.request(
    z.object({
      sobjects: z.array(z.object({ name: z.string(), label: z.string(), queryable: z.boolean() })),
    }),
    { path: `${dataRoot}/sobjects` },
  );

  return result.sobjects
    .filter((object) => object.queryable)
    .map((object) => ({ label: object.label, value: object.name }))
    .sort((first, second) => first.label.localeCompare(second.label));
}

/** The chosen object's fields. */
export async function fieldOptions({ client, input }: Args): Promise<PieceOption[]> {
  const object = matching(input.object, apiName);

  if (!object) return [];

  const { fields } = await describe(client, object);

  return fields.map((field) => ({ label: field.label, value: field.name }));
}

/** Up to 200 records of one object, by name. */
export const recordOptions =
  (object: string, where = '') =>
  async ({ client }: Args): Promise<PieceOption[]> => {
    const records = await soql(
      client,
      `SELECT Id, Name FROM ${object}${where ? ` WHERE ${where}` : ''} ORDER BY Name LIMIT 200`,
    );

    return records.map((record) => ({
      label: label(record.Name, String(record.Id)),
      value: String(record.Id),
    }));
  };

/** A picklist field's active values. */
export const picklistOptions =
  (object: string, field: string) =>
  async ({ client }: Args): Promise<PieceOption[]> => {
    const { fields } = await describe(client, object);

    return (fields.find((entry) => entry.name === field)?.picklistValues ?? [])
      .filter((value) => value.active)
      .map((value) => ({ label: value.label, value: value.value }));
  };

/** The chosen campaign's member statuses. */
export async function campaignStatusOptions({ client, input }: Args): Promise<PieceOption[]> {
  const campaignId = matching(input.campaignId, id);

  if (!campaignId) return [];

  const records = await soql(
    client,
    `SELECT Label FROM CampaignMemberStatus WHERE CampaignId = ${soqlString(campaignId)}`,
  );

  return records.map((record) => ({ label: String(record.Label), value: String(record.Label) }));
}
