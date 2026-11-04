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

expectTypeOf<Parameters<typeof hubspot.createDeal>[0]['input']>().toEqualTypeOf<{
  dealname: string;
  pipelineId: string;
  pipelineStageId: string;
  objectProperties?: Record<string, string | number | boolean | string[]>;
  additionalPropertiesToRetrieve?: string[];
}>();

expectTypeOf<Parameters<typeof hubspot.updateDeal>[0]['input']>().toEqualTypeOf<{
  dealId: string;
  dealname?: string;
  pipelineId?: string;
  pipelineStageId?: string;
  objectProperties?: Record<string, string | number | boolean | string[]>;
  additionalPropertiesToRetrieve?: string[];
}>();

expectTypeOf<Parameters<typeof hubspot.getCustomObject>[0]['input']>().toEqualTypeOf<{
  customObjectType: string;
  customObjectId: string;
  additionalPropertiesToRetrieve?: string[];
}>();

const _owner = hubspot.getOwnerByEmail({ input: { email: 'sam@acme.com' } });

expectTypeOf<Awaited<typeof _owner>>().toExtend<{ id: string } | null>();

expectTypeOf(hubspot.triggers.newContact.type).toEqualTypeOf<'polling'>();

expectTypeOf(hubspot.triggers.newEngagement.type).toEqualTypeOf<'polling'>();
