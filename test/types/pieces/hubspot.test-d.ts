import { createHubSpot } from '@frogbotai/piece-hubspot';
import { expectTypeOf } from 'vitest';

const hubspot = createHubSpot({ auth: { accessToken: 'token' } });

createHubSpot({ oauth: { clientId: 'client', clientSecret: 'secret' } });

expectTypeOf<Parameters<typeof hubspot.listRecords>[0]['input']>().toEqualTypeOf<{
  objectType:
    | 'contacts'
    | 'companies'
    | 'deals'
    | 'tickets'
    | 'notes'
    | 'emails'
    | 'calls'
    | 'meetings'
    | 'tasks'
    | 'line_items'
    | 'products'
    | `2-${number}`;
  properties?: string[];
  associations?: string[];
  limit?: number;
  cursor?: string;
}>();

const _page = hubspot.listRecords({ input: { objectType: 'contacts' } });

expectTypeOf<Awaited<typeof _page>['nextCursor']>().toEqualTypeOf<string | null>();
expectTypeOf<Awaited<typeof _page>['results'][number]['id']>().toEqualTypeOf<string>();

expectTypeOf<Awaited<typeof _page>['results'][number]['properties']>().toEqualTypeOf<
  Record<string, string | null>
>();

// @ts-expect-error listRecords needs an object type
void hubspot.listRecords({ input: {} });

// @ts-expect-error a custom object type is a 2- type ID
void hubspot.listRecords({ input: { objectType: 'cars' } });
