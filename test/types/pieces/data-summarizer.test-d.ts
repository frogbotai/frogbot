import { createDataSummarizer } from '@frogbotai/piece-data-summarizer';
import type { FrogBotRequest } from 'frogbot';
import { expectTypeOf } from 'vitest';

declare const req: FrogBotRequest;

const dataSummarizer = createDataSummarizer();

const uniques = dataSummarizer.countUniqueValues({
  input: { values: [{ id: 1 }], fields: ['id'] },
  req,
});

expectTypeOf<Parameters<typeof dataSummarizer.countUniqueValues>[0]['input']>().toEqualTypeOf<{
  values: unknown[];
  fields?: string[] | undefined;
}>();
expectTypeOf(uniques).toEqualTypeOf<Promise<{ numUniques: number }>>();

const _calculateSumRejectsCountUniqueValuesInput = () =>
  // @ts-expect-error calculateSum does not accept countUniqueValues input
  dataSummarizer.calculateSum({ input: { values: [1], fields: ['id'] }, req });

expectTypeOf(dataSummarizer.findMinMax({ input: { values: [1, 2] }, req })).toEqualTypeOf<
  Promise<{ min: number; max: number }>
>();
