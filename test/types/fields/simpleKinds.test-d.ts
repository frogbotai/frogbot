import type {
  BarcodeFieldArgs,
  DurationFieldArgs,
  FrogBotRequest,
  NumberField,
  PercentFieldArgs,
  PhoneFieldArgs,
  RatingFieldArgs,
  TextField,
  UrlFieldArgs,
} from 'frogbot';
import {
  barcodeField,
  durationField,
  percentField,
  phoneField,
  ratingField,
  urlField,
} from 'frogbot';
import type {
  DurationFormat,
  DurationKind,
  FormatDurationArgs,
  FormatPercentArgs,
  FormatPhoneArgs,
  ParseDurationArgs,
  PercentKind,
  RatingKind,
} from 'frogbot/fields';
import {
  formatDuration,
  formatPercent,
  formatPhone,
  getPhoneHref,
  getUrlHref,
  parseDuration,
} from 'frogbot/fields';
import { expectTypeOf } from 'vitest';

expectTypeOf(percentField).returns.toEqualTypeOf<NumberField>();
expectTypeOf(ratingField).returns.toEqualTypeOf<NumberField>();
expectTypeOf(durationField).returns.toEqualTypeOf<NumberField>();

expectTypeOf<PercentFieldArgs['precision']>().toEqualTypeOf<number | undefined>();
expectTypeOf<RatingFieldArgs['max']>().toEqualTypeOf<number | undefined>();
expectTypeOf<DurationFieldArgs['format']>().toEqualTypeOf<DurationFormat | undefined>();
expectTypeOf<DurationFormat>().toEqualTypeOf<'h:mm' | 'h:mm:ss'>();

expectTypeOf<PercentKind>().toEqualTypeOf<{ type: 'percent'; precision: number }>();
expectTypeOf<RatingKind>().toEqualTypeOf<{ type: 'rating'; max: number }>();
expectTypeOf<DurationKind>().toEqualTypeOf<{ type: 'duration'; format: DurationFormat }>();

expectTypeOf(formatPercent).parameter(0).toEqualTypeOf<FormatPercentArgs>();
expectTypeOf(formatPercent).returns.toEqualTypeOf<string>();
expectTypeOf(formatDuration).parameter(0).toEqualTypeOf<FormatDurationArgs>();
expectTypeOf(formatDuration).returns.toEqualTypeOf<string>();
expectTypeOf(parseDuration).parameter(0).toEqualTypeOf<ParseDurationArgs>();
expectTypeOf(parseDuration).returns.toEqualTypeOf<number | null | undefined>();

percentField({
  name: 'progress',
  precision: 2,
  min: 0,
  max: 1,
  validate: (value, { req }) => {
    expectTypeOf(value).toBeAny();
    expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

    return true;
  },
  hooks: {
    beforeChange: [
      ({ req, value }) => {
        expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

        return value;
      },
    ],
  },
});

ratingField({ name: 'score', max: 10, required: true });

durationField({ name: 'timeSpent', format: 'h:mm', min: 0 });
durationField({ name: 'timeSpent', format: 'h:mm:ss' });

// @ts-expect-error format is one of the two duration layouts
durationField({ name: 'timeSpent', format: 'mm' });

// @ts-expect-error percent fields hold one value
percentField({ name: 'progress', hasMany: true });

// @ts-expect-error rating fields hold one value
ratingField({ name: 'score', hasMany: true });

// @ts-expect-error duration fields hold one value
durationField({ name: 'timeSpent', hasMany: true });

// @ts-expect-error minRows only applies to hasMany fields
percentField({ name: 'progress', minRows: 1 });

// @ts-expect-error minRows only applies to hasMany fields
ratingField({ name: 'score', minRows: 1 });

// @ts-expect-error minRows only applies to hasMany fields
durationField({ name: 'timeSpent', minRows: 1 });

// @ts-expect-error the factory sets the type
percentField({ name: 'progress', type: 'number' });

// @ts-expect-error the factory sets the type
ratingField({ name: 'score', type: 'number' });

// @ts-expect-error the factory sets the type
durationField({ name: 'timeSpent', type: 'number' });

// @ts-expect-error ratings always start at 1
ratingField({ name: 'score', min: 0 });

expectTypeOf(urlField).returns.toEqualTypeOf<TextField>();
expectTypeOf(phoneField).returns.toEqualTypeOf<TextField>();
expectTypeOf(barcodeField).returns.toEqualTypeOf<TextField>();

expectTypeOf<UrlFieldArgs['minLength']>().toEqualTypeOf<number | undefined>();
expectTypeOf<PhoneFieldArgs['maxLength']>().toEqualTypeOf<number | undefined>();
expectTypeOf<BarcodeFieldArgs['required']>().toEqualTypeOf<boolean | undefined>();

expectTypeOf(getUrlHref).parameter(0).toEqualTypeOf<{ value: unknown }>();
expectTypeOf(getUrlHref).returns.toEqualTypeOf<string | undefined>();
expectTypeOf(getPhoneHref).parameter(0).toEqualTypeOf<FormatPhoneArgs>();
expectTypeOf(getPhoneHref).returns.toEqualTypeOf<string | undefined>();
expectTypeOf(formatPhone).parameter(0).toEqualTypeOf<FormatPhoneArgs>();
expectTypeOf(formatPhone).returns.toEqualTypeOf<string>();

urlField({
  name: 'website',
  minLength: 4,
  maxLength: 200,
  validate: (value, { req }) => {
    expectTypeOf(value).toBeAny();
    expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

    return true;
  },
  hooks: {
    beforeChange: [
      ({ req, value }) => {
        expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

        return value;
      },
    ],
  },
});

phoneField({ name: 'phone', required: true });

barcodeField({ name: 'sku', maxLength: 13 });

// @ts-expect-error URL fields hold one value
urlField({ name: 'website', hasMany: true });

// @ts-expect-error phone fields hold one value
phoneField({ name: 'phone', hasMany: true });

// @ts-expect-error barcode fields hold one value
barcodeField({ name: 'sku', hasMany: true });

// @ts-expect-error minRows only applies to hasMany fields
urlField({ name: 'website', minRows: 1 });

// @ts-expect-error minRows only applies to hasMany fields
phoneField({ name: 'phone', minRows: 1 });

// @ts-expect-error minRows only applies to hasMany fields
barcodeField({ name: 'sku', minRows: 1 });

// @ts-expect-error the factory sets the type
urlField({ name: 'website', type: 'text' });

// @ts-expect-error the factory sets the type
phoneField({ name: 'phone', type: 'text' });

// @ts-expect-error the factory sets the type
barcodeField({ name: 'sku', type: 'text' });
