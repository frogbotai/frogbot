import type {
  AutonumberFieldArgs,
  AutonumberKeyFieldArgs,
  FieldAccess,
  NumberField,
  RelationshipField,
  TextField,
} from 'frogbot';
import {
  autonumberField,
  autonumberKeyField,
  createCreatedByField,
  createUpdatedByField,
} from 'frogbot';
import { expectTypeOf } from 'vitest';

expectTypeOf(autonumberField).returns.toEqualTypeOf<NumberField>();
expectTypeOf(autonumberKeyField).returns.toEqualTypeOf<TextField>();
expectTypeOf(createCreatedByField).returns.toEqualTypeOf<RelationshipField>();
expectTypeOf(createUpdatedByField).returns.toEqualTypeOf<RelationshipField>();

expectTypeOf<AutonumberFieldArgs['access']>().toEqualTypeOf<{ read?: FieldAccess } | undefined>();
expectTypeOf<AutonumberFieldArgs['scope']>().toEqualTypeOf<string | undefined>();

expectTypeOf<AutonumberKeyFieldArgs['access']>().toEqualTypeOf<
  { read?: FieldAccess } | undefined
>();

expectTypeOf<AutonumberKeyFieldArgs['number']>().toEqualTypeOf<string>();
expectTypeOf<AutonumberKeyFieldArgs['prefix']>().toEqualTypeOf<string>();

autonumberField({ name: 'number', label: 'Ticket #', index: true, access: { read: () => true } });
autonumberField({ name: 'number', scope: 'project' });

autonumberKeyField({ name: 'key', number: 'number', prefix: 'key', access: { read: () => true } });

// @ts-expect-error number is required
autonumberKeyField({ name: 'key', prefix: 'key' });

// @ts-expect-error prefix is required
autonumberKeyField({ name: 'key', number: 'number' });

// @ts-expect-error a key is always unique
autonumberKeyField({ name: 'key', number: 'number', prefix: 'key', unique: true });

// @ts-expect-error FrogBot sets the key, so it is never required input
autonumberKeyField({ name: 'key', number: 'number', prefix: 'key', required: true });

// @ts-expect-error a key holds one value
autonumberKeyField({ name: 'key', number: 'number', prefix: 'key', hasMany: true });

// @ts-expect-error a key is the same in every locale
autonumberKeyField({ name: 'key', number: 'number', prefix: 'key', localized: true });

// @ts-expect-error FrogBot sets the key
autonumberKeyField({ name: 'key', number: 'number', prefix: 'key', defaultValue: 'APP-1' });

autonumberKeyField({
  name: 'key',
  number: 'number',
  prefix: 'key',
  // @ts-expect-error nobody writes the key
  access: { update: () => true },
});

createCreatedByField({ overrides: { admin: { hidden: false } } });
