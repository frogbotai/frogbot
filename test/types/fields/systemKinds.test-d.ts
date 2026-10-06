import type {
  AutonumberFieldArgs,
  CreatedByFieldArgs,
  FieldAccess,
  FrogBotRequest,
  LastModifiedByFieldArgs,
  NumberField,
  RelationshipField,
} from 'frogbot';
import { autonumberField, createdByField, lastModifiedByField } from 'frogbot';
import { expectTypeOf } from 'vitest';

expectTypeOf(createdByField).returns.toEqualTypeOf<RelationshipField>();
expectTypeOf(lastModifiedByField).returns.toEqualTypeOf<RelationshipField>();
expectTypeOf(autonumberField).returns.toEqualTypeOf<NumberField>();

expectTypeOf<CreatedByFieldArgs['relationTo']>().toEqualTypeOf<string | undefined>();
expectTypeOf<LastModifiedByFieldArgs['relationTo']>().toEqualTypeOf<string | undefined>();
expectTypeOf<CreatedByFieldArgs['access']>().toEqualTypeOf<{ read?: FieldAccess } | undefined>();
expectTypeOf<AutonumberFieldArgs['access']>().toEqualTypeOf<{ read?: FieldAccess } | undefined>();

createdByField({ name: 'createdBy' });
createdByField({ name: 'createdBy', relationTo: 'admins', label: 'Created by' });
lastModifiedByField({
  name: 'lastModifiedBy',
  access: {
    read: ({ req }) => {
      expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

      return true;
    },
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
autonumberField({ name: 'number', label: 'Ticket #', index: true, access: { read: () => true } });

// @ts-expect-error a creator is one user
createdByField({ name: 'createdBy', hasMany: true });

// @ts-expect-error relationTo is one collection slug
createdByField({ name: 'createdBy', relationTo: ['users', 'admins'] });

// @ts-expect-error relationTo is one collection slug
lastModifiedByField({ name: 'lastModifiedBy', relationTo: ['users'] });

// @ts-expect-error FrogBot sets the value
createdByField({ name: 'createdBy', defaultValue: 'u1' });

// @ts-expect-error FrogBot sets the value
lastModifiedByField({ name: 'lastModifiedBy', required: true });

// @ts-expect-error the value is the same in every locale
lastModifiedByField({ name: 'lastModifiedBy', localized: true });

// @ts-expect-error minRows only applies to hasMany fields
createdByField({ name: 'createdBy', minRows: 1 });

// @ts-expect-error nobody can write the value
createdByField({ name: 'createdBy', access: { create: () => true } });

// @ts-expect-error nobody can write the value
lastModifiedByField({ name: 'lastModifiedBy', access: { update: () => true } });

// @ts-expect-error the factory sets the type
createdByField({ name: 'createdBy', type: 'relationship' });

// @ts-expect-error FrogBot stores the value
createdByField({ name: 'createdBy', virtual: true });

// @ts-expect-error FrogBot stores the value
lastModifiedByField({ name: 'lastModifiedBy', virtual: true });

// @ts-expect-error a record has one number
autonumberField({ name: 'number', hasMany: true });

// @ts-expect-error numbers are always unique
autonumberField({ name: 'number', unique: false });

// @ts-expect-error FrogBot sets the value
autonumberField({ name: 'number', defaultValue: 1 });

// @ts-expect-error FrogBot sets the value
autonumberField({ name: 'number', required: true });

// @ts-expect-error the value is the same in every locale
autonumberField({ name: 'number', localized: true });

// @ts-expect-error nobody can write the value
autonumberField({ name: 'number', access: { create: () => true } });

// @ts-expect-error nobody can write the value
autonumberField({ name: 'number', access: { update: () => true } });

// @ts-expect-error the factory sets the type
autonumberField({ name: 'number', type: 'number' });

// @ts-expect-error FrogBot stores the value
autonumberField({ name: 'number', virtual: true });
