import type {
  BlocksField,
  Field,
  FrogBot,
  FrogBotRequest,
  RelationshipField,
  SelectField,
  TextField,
  UploadField,
} from 'frogbot';
import type {
  BlocksField as PayloadBlocksField,
  DefaultValue as PayloadDefaultValue,
  FilterOptionsProps,
  SelectField as PayloadSelectField,
} from 'payload';
import { expectTypeOf } from 'vitest';

type FunctionOf<T> = Extract<NonNullable<T>, (...args: never[]) => unknown>;
type ArgsOf<T> = Parameters<FunctionOf<T>>[0];

type PayloadDefaultValueArgs = Parameters<FunctionOf<PayloadDefaultValue>>[0];
type PayloadSelectFilterArgs = Parameters<FunctionOf<PayloadSelectField['filterOptions']>>[0];

const text: TextField = {
  defaultValue: ({ locale, req, user }) => {
    expectTypeOf(locale).toEqualTypeOf<PayloadDefaultValueArgs['locale']>();
    expectTypeOf(user).toEqualTypeOf<PayloadDefaultValueArgs['user']>();
    expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();
    expectTypeOf(req.frogbot).toEqualTypeOf<FrogBot>();

    return 'draft';
  },
  name: 'status',
  type: 'text',
};

const relationship: RelationshipField = {
  filterOptions: ({ req }) => {
    expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

    return { owner: { equals: req.user?.id } };
  },
  name: 'owner',
  relationTo: 'users',
  type: 'relationship',
};

const relationshipMany: RelationshipField = {
  filterOptions: ({ req }) => {
    expectTypeOf(req.frogbot).toEqualTypeOf<FrogBot>();

    return Promise.resolve(true);
  },
  hasMany: true,
  name: 'owners',
  relationTo: 'users',
  type: 'relationship',
};

const relationshipPolymorphic: RelationshipField = {
  filterOptions: ({ relationTo, req }) => {
    expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

    return relationTo === 'users';
  },
  name: 'subject',
  relationTo: ['users', 'posts'],
  type: 'relationship',
};

const upload: UploadField = {
  filterOptions: ({ req }) => {
    expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

    return { mimeType: { contains: 'image' } };
  },
  name: 'image',
  relationTo: 'media',
  type: 'upload',
};

const select: SelectField = {
  filterOptions: ({ options, req }) => {
    expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

    return options.filter(() => Boolean(req.frogbot));
  },
  name: 'color',
  options: ['red', 'green'],
  type: 'select',
};

const blocks: BlocksField = {
  blocks: [],
  filterOptions: ({ req }) => {
    expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

    return ['hero'];
  },
  name: 'layout',
  type: 'blocks',
};

const nested: Field[] = [
  {
    fields: [
      {
        defaultValue: ({ req }) => {
          expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

          return 'nested';
        },
        name: 'label',
        type: 'text',
      },
    ],
    name: 'items',
    type: 'array',
  },
];

expectTypeOf(text).toMatchTypeOf<TextField>();
expectTypeOf(relationship).toMatchTypeOf<RelationshipField>();
expectTypeOf(relationshipMany).toMatchTypeOf<RelationshipField>();
expectTypeOf(relationshipPolymorphic).toMatchTypeOf<RelationshipField>();
expectTypeOf(upload).toMatchTypeOf<UploadField>();
expectTypeOf(select).toMatchTypeOf<SelectField>();
expectTypeOf(blocks).toMatchTypeOf<BlocksField>();
expectTypeOf(nested).toMatchTypeOf<Field[]>();

export const payloadDefaultValue: TextField = {
  defaultValue: ({ req }) => {
    // @ts-expect-error Payload is not exposed on FrogBot requests
    return String(req.payload);
  },
  name: 'status',
  type: 'text',
};

export const payloadRelationshipFilter: RelationshipField = {
  filterOptions: ({ req }) => {
    // @ts-expect-error Payload is not exposed on FrogBot requests
    return Boolean(req.payload);
  },
  name: 'owner',
  relationTo: 'users',
  type: 'relationship',
};

export const payloadUploadFilter: UploadField = {
  filterOptions: ({ req }) => {
    // @ts-expect-error Payload is not exposed on FrogBot requests
    return Boolean(req.payload);
  },
  name: 'image',
  relationTo: 'media',
  type: 'upload',
};

export const payloadSelectFilter: SelectField = {
  filterOptions: ({ options, req }) => {
    // @ts-expect-error Payload is not exposed on FrogBot requests
    return req.payload ? options : [];
  },
  name: 'color',
  options: ['red'],
  type: 'select',
};

export const payloadBlocksFilter: BlocksField = {
  blocks: [],
  filterOptions: ({ req }) => {
    // @ts-expect-error Payload is not exposed on FrogBot requests
    return req.payload ? true : [];
  },
  name: 'layout',
  type: 'blocks',
};

export const asyncSelectFilter: SelectField = {
  // @ts-expect-error select filterOptions is called synchronously
  filterOptions: ({ options }) => Promise.resolve(options),
  name: 'color',
  options: ['red'],
  type: 'select',
};

const statics: Field[] = [
  { defaultValue: 'draft', name: 'status', type: 'text' },
  { defaultValue: 3, name: 'count', type: 'number' },
  { defaultValue: { theme: 'dark' }, name: 'settings', type: 'json' },
  {
    filterOptions: { role: { equals: 'admin' } },
    name: 'owner',
    relationTo: 'users',
    type: 'relationship',
  },
  { filterOptions: null, name: 'image', relationTo: 'media', type: 'upload' },
  { blocks: [], filterOptions: ['hero', 'cta'], name: 'layout', type: 'blocks' },
];

expectTypeOf(statics).toMatchTypeOf<Field[]>();

expectTypeOf<keyof ArgsOf<TextField['defaultValue']>>().toEqualTypeOf<
  keyof PayloadDefaultValueArgs
>();
expectTypeOf<ArgsOf<TextField['defaultValue']>['req']>().toEqualTypeOf<FrogBotRequest>();
expectTypeOf<keyof ArgsOf<RelationshipField['filterOptions']>>().toEqualTypeOf<
  keyof FilterOptionsProps
>();
expectTypeOf<ArgsOf<RelationshipField['filterOptions']>['req']>().toEqualTypeOf<FrogBotRequest>();
expectTypeOf<keyof ArgsOf<UploadField['filterOptions']>>().toEqualTypeOf<
  keyof FilterOptionsProps
>();
expectTypeOf<ArgsOf<UploadField['filterOptions']>['req']>().toEqualTypeOf<FrogBotRequest>();
expectTypeOf<keyof ArgsOf<SelectField['filterOptions']>>().toEqualTypeOf<
  keyof PayloadSelectFilterArgs
>();
expectTypeOf<ArgsOf<SelectField['filterOptions']>['req']>().toEqualTypeOf<FrogBotRequest>();
expectTypeOf<keyof ArgsOf<BlocksField['filterOptions']>>().toEqualTypeOf<
  keyof ArgsOf<PayloadBlocksField['filterOptions']>
>();
expectTypeOf<ArgsOf<BlocksField['filterOptions']>['req']>().toEqualTypeOf<FrogBotRequest>();

const validatedRelationship: RelationshipField = {
  name: 'owner',
  relationTo: 'users',
  type: 'relationship',
  validate: (_value, _options) => {
    expectTypeOf<ArgsOf<typeof _options.filterOptions>['req']>().toEqualTypeOf<FrogBotRequest>();
    expectTypeOf<ArgsOf<typeof _options.defaultValue>['req']>().toEqualTypeOf<FrogBotRequest>();

    return true;
  },
};

const validatedSelect: SelectField = {
  name: 'color',
  options: ['red'],
  type: 'select',
  validate: (_value, _options) => {
    expectTypeOf<ArgsOf<typeof _options.filterOptions>['req']>().toEqualTypeOf<FrogBotRequest>();

    return true;
  },
};

expectTypeOf(validatedRelationship).toMatchTypeOf<RelationshipField>();
expectTypeOf(validatedSelect).toMatchTypeOf<SelectField>();
