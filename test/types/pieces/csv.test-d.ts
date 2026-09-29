import { createCsv } from '@frogbotai/piece-csv';
import type { FrogBotRequest } from 'frogbot';
import { expectTypeOf } from 'vitest';

declare const req: FrogBotRequest;

const csv = createCsv();

const rows = csv.convertCsvToJson({ input: { csvText: 'a,b', hasHeaders: true }, req });

expectTypeOf<Parameters<typeof csv.convertCsvToJson>[0]['input']>().toEqualTypeOf<{
  csvText?: string | undefined;
  hasHeaders?: boolean | undefined;
  delimiter?: ',' | '\t' | undefined;
}>();
expectTypeOf(rows).toEqualTypeOf<Promise<(string[] | Record<string, string>)[]>>();

// @ts-expect-error convertCsvToJson does not accept convertJsonToCsv input
csv.convertCsvToJson({ input: { jsonArray: [{ a: 1 }] }, req });
