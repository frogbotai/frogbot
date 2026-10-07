import { createAirtable } from '@frogbotai/piece-airtable';
import { expectTypeOf } from 'vitest';

const airtable = createAirtable({ auth: { personalAccessToken: 'token' } });

const _records = airtable.findRecords({
  input: { baseId: 'base', tableId: 'table', searchField: 'Name', searchValue: 'Frog' },
});

expectTypeOf<Parameters<typeof airtable.findRecords>[0]['input']>().toEqualTypeOf<{
  baseId: string;
  tableId: string;
  searchField: string;
  searchValue: string;
  viewId?: string | undefined;
}>();

expectTypeOf<Awaited<typeof _records>[number]['id']>().toEqualTypeOf<string>();
expectTypeOf<Awaited<typeof _records>[number]['fields']>().toEqualTypeOf<Record<string, unknown>>();

const _findRecordsRejectsCreateBaseInput = () =>
  // @ts-expect-error findRecords does not accept createBase input
  airtable.findRecords({ input: { workspaceId: 'workspace', name: 'Base', tables: [] } });

expectTypeOf<keyof typeof airtable.triggers>().toEqualTypeOf<'newRecord' | 'newOrUpdatedRecord'>();
expectTypeOf(airtable.triggers.newOrUpdatedRecord.type).toEqualTypeOf<'polling'>();
