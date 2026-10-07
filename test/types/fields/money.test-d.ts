import type { FrogBotRequest, MoneyFieldArgs, NumberField } from 'frogbot';
import { moneyField } from 'frogbot';
import type { FormatMoneyArgs, MoneyKind, MoneyPrecision } from 'frogbot/fields';
import { formatMoney } from 'frogbot/fields';
import { expectTypeOf } from 'vitest';

expectTypeOf(moneyField).returns.toEqualTypeOf<NumberField>();
expectTypeOf<MoneyFieldArgs['currency']>().toEqualTypeOf<string | undefined>();
expectTypeOf<MoneyFieldArgs['precision']>().toEqualTypeOf<'auto' | number | undefined>();
expectTypeOf<MoneyPrecision>().toEqualTypeOf<'auto' | number>();

expectTypeOf<MoneyKind>().toEqualTypeOf<{
  type: 'money';
  currency: string;
  precision: MoneyPrecision;
}>();

expectTypeOf(formatMoney).parameter(0).toEqualTypeOf<FormatMoneyArgs>();
expectTypeOf(formatMoney).returns.toEqualTypeOf<string>();

moneyField({
  name: 'price',
  currency: 'EUR',
  precision: 2,
  min: 0,
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

// @ts-expect-error money fields hold one amount
moneyField({ name: 'price', hasMany: true });

// @ts-expect-error minRows only applies to hasMany fields
moneyField({ name: 'price', minRows: 1 });

// @ts-expect-error the factory sets the type
moneyField({ name: 'price', type: 'number' });
