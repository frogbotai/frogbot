import { createDateHelper } from '@frogbotai/piece-date-helper';
import type { FrogBotRequest } from 'frogbot';
import { expectTypeOf } from 'vitest';

declare const req: FrogBotRequest;

const dateHelper = createDateHelper();

const difference = dateHelper.dateDifference({
  input: { startDate: '2026-01-01', endDate: '2026-02-01', unitDifference: ['day'] },
  req,
});

expectTypeOf<Parameters<typeof dateHelper.dateDifference>[0]['input']>().toEqualTypeOf<{
  startDate: string;
  startDateFormat?: string | undefined;
  endDate: string;
  endDateFormat?: string | undefined;
  unitDifference?: ('year' | 'month' | 'day' | 'hour' | 'minute' | 'second')[] | undefined;
}>();
expectTypeOf(difference).toEqualTypeOf<Promise<Record<string, number>>>();

const _dateDifferenceRejectsGetCurrentDateInput = () =>
  // @ts-expect-error dateDifference does not accept getCurrentDate input
  dateHelper.dateDifference({ input: { timeZone: 'UTC' }, req });

expectTypeOf(dateHelper.getCurrentDate({ input: {}, req })).toEqualTypeOf<
  Promise<{ result: string }>
>();
