import type { AirtableClient } from './client.js';

type PartialSelection = { baseId?: string; tableId?: string };

export async function baseOptions({ client }: { client: AirtableClient }) {
  const bases = await client.listAll<{ id: string; name: string }>({
    path: '/meta/bases',
    key: 'bases',
  });

  return bases.map(({ id, name }) => ({ label: name, value: id }));
}

export async function tableOptions({
  client,
  input,
}: {
  client: AirtableClient;
  input: PartialSelection;
}) {
  if (!input.baseId) return [];

  const tables = await client.listAll<{ id: string; name: string }>({
    path: `/meta/bases/${input.baseId}/tables`,
    key: 'tables',
  });

  return tables.map(({ id, name }) => ({ label: name, value: id }));
}

export async function table(client: AirtableClient, input: PartialSelection) {
  if (!input.baseId || !input.tableId) return undefined;

  const tables = await client.listAll<{
    id: string;
    fields: Array<{ id: string; name: string; type: string }>;
    views?: Array<{ id: string; name: string }>;
  }>({ path: `/meta/bases/${input.baseId}/tables`, key: 'tables' });

  return tables.find(({ id }) => id === input.tableId);
}

export async function viewOptions(args: { client: AirtableClient; input: PartialSelection }) {
  const selected = await table(args.client, args.input);

  return (selected?.views ?? []).map(({ id, name }) => ({ label: name, value: id }));
}

export async function fieldOptions(args: { client: AirtableClient; input: PartialSelection }) {
  const selected = await table(args.client, args.input);

  return (selected?.fields ?? []).map(({ name }) => ({ label: name, value: name }));
}

export async function attachmentOptions(args: { client: AirtableClient; input: PartialSelection }) {
  const selected = await table(args.client, args.input);

  return (selected?.fields ?? [])
    .filter(({ type }) => type === 'multipleAttachments')
    .map(({ id, name }) => ({ label: name, value: id }));
}
