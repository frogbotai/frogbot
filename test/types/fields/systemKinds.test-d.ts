import type { AutonumberFieldArgs, FieldAccess, NumberField, RelationshipField } from 'frogbot';
import { autonumberField, createCreatedByField, createUpdatedByField } from 'frogbot';
import { expectTypeOf } from 'vitest';

expectTypeOf(autonumberField).returns.toEqualTypeOf<NumberField>();
expectTypeOf(createCreatedByField).returns.toEqualTypeOf<RelationshipField>();
expectTypeOf(createUpdatedByField).returns.toEqualTypeOf<RelationshipField>();

expectTypeOf<AutonumberFieldArgs['access']>().toEqualTypeOf<{ read?: FieldAccess } | undefined>();

autonumberField({ name: 'number', label: 'Ticket #', index: true, access: { read: () => true } });

createCreatedByField({ overrides: { admin: { hidden: false } } });
