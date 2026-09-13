import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { pieceInstanceTools } from '../../../packages/frogbot/src/pieces/definePiece.js';
import {
  createDateHelper,
  dateHelperActions,
} from '../../../packages/pieces/piece-date-helper/src/index.js';

const dateHelper = createDateHelper();
const req = {} as never;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2024-03-15T12:34:56Z'));
});

afterEach(() => vi.useRealTimers());

describe('date-helper', () => {
  it('exposes every registered upstream action under semantic names', () => {
    expect(pieceInstanceTools(dateHelper)?.map(({ slug }) => slug)).toEqual(
      dateHelperActions.map((action) => `date-helper_${action}`),
    );
    expect(dateHelperActions).toHaveLength(9);
  });

  it('gets and converts dates with explicit time zones', async () => {
    await expect(
      dateHelper.getCurrentDate({
        input: { timeFormat: 'YYYY-MM-DD HH:mm:ss', timeZone: 'America/New_York' },
        req,
      }),
    ).resolves.toEqual({ result: '2024-03-15 08:34:56' });

    await expect(
      dateHelper.formatDate({
        input: {
          inputDate: '2024-03-15 08:00:00',
          inputFormat: 'YYYY-MM-DD HH:mm:ss',
          inputTimeZone: 'America/New_York',
          outputFormat: 'YYYY-MM-DD HH:mm:ss',
          outputTimeZone: 'UTC',
        },
        req,
      }),
    ).resolves.toEqual({ result: '2024-03-15 12:00:00' });
  });

  it('extracts parts and duration components', async () => {
    await expect(
      dateHelper.extractDateParts({
        input: {
          inputDate: '2024-02-29 13:14:15',
          inputFormat: 'YYYY-MM-DD HH:mm:ss',
          unitExtract: ['year', 'month', 'day', 'dayOfWeek', 'monthName'],
        },
        req,
      }),
    ).resolves.toEqual({
      year: 2024,
      month: 2,
      day: 29,
      dayOfWeek: 'Thursday',
      monthName: 'February',
    });

    await expect(
      dateHelper.dateDifference({
        input: {
          startDate: '2024-01-01 00:00:00',
          startDateFormat: 'YYYY-MM-DD HH:mm:ss',
          endDate: '2024-02-03 04:05:06',
          endDateFormat: 'YYYY-MM-DD HH:mm:ss',
          unitDifference: ['month', 'day', 'hour', 'minute', 'second'],
        },
        req,
      }),
    ).resolves.toEqual({ month: 1, day: 3, hour: 4, minute: 5, second: 6 });
  });

  it('applies signed expressions and a selected wall-clock time', async () => {
    await expect(
      dateHelper.addSubtractDate({
        input: {
          inputDate: '2024-01-31 10:15:00',
          inputDateFormat: 'YYYY-MM-DD HH:mm:ss',
          outputFormat: 'YYYY-MM-DD HH:mm:ss',
          expression: '+ 1 month - 2 days + 30 minutes',
          timeZone: 'UTC',
          setTime: '09:45',
          useCurrentTime: false,
        },
        req,
      }),
    ).resolves.toEqual({ result: '2024-02-27 09:45:00' });

    await expect(
      dateHelper.addSubtractDate({
        input: {
          inputDate: '2024-01-01',
          inputDateFormat: 'YYYY-MM-DD',
          outputFormat: 'YYYY-MM-DD',
          expression: 'tomorrow',
          useCurrentTime: false,
        },
        req,
      }),
    ).rejects.toThrow('Invalid date expression: tomorrow');
  });

  it('finds future weekly and annual occurrences from a controlled clock', async () => {
    await expect(
      dateHelper.nextDayOfWeek({
        input: {
          weekday: 5,
          time: '12:00',
          currentTime: false,
          timeFormat: 'YYYY-MM-DD HH:mm:ss',
          timeZone: 'UTC',
        },
        req,
      }),
    ).resolves.toEqual({ result: '2024-03-22 12:00:00' });

    await expect(
      dateHelper.nextDayOfYear({
        input: {
          month: 2,
          day: 29,
          time: '09:30',
          currentTime: false,
          timeFormat: 'YYYY-MM-DD HH:mm:ss',
          timeZone: 'UTC',
        },
        req,
      }),
    ).resolves.toEqual({ result: '2025-02-28 09:30:00' });
  });

  it('returns both previous-month boundaries from a controlled clock', async () => {
    const input = {
      time: '09:30',
      currentTime: false,
      timeFormat: 'YYYY-MM-DD HH:mm:ss',
      timeZone: 'UTC',
    };

    await expect(dateHelper.firstDayOfPreviousMonth({ input, req })).resolves.toEqual({
      result: '2024-02-01 09:30:00',
    });
    await expect(dateHelper.lastDayOfPreviousMonth({ input, req })).resolves.toEqual({
      result: '2024-02-29 09:30:00',
    });
  });
});
