import { createBraveSearch } from '@frogbotai/piece-brave-search';
import type { FrogBotRequest } from 'frogbot';
import { expectTypeOf } from 'vitest';

declare const req: FrogBotRequest;

const braveSearch = createBraveSearch({ auth: { apiKey: 'key' } });

const _results = braveSearch.searchWeb({ input: { query: 'frogs' }, req });

expectTypeOf<Parameters<typeof braveSearch.searchWeb>[0]['input']>().toEqualTypeOf<{
  query: string;
  count?: number | undefined;
}>();
expectTypeOf<
  NonNullable<Awaited<typeof _results>['web']>['results'][number]['url']
>().toEqualTypeOf<string>();

const _searchWebRejectsCustomApiCallInput = () =>
  // @ts-expect-error searchWeb does not accept customApiCall input
  braveSearch.searchWeb({ input: { method: 'GET', path: '/web/search' }, req });
