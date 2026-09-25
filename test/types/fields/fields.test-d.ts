import {
  type ArrayField,
  type BlocksField,
  type CheckboxField,
  type CodeField,
  type CollapsibleField,
  type DateField,
  type EmailField,
  type Field,
  type GroupField,
  type JoinField,
  type JSONField,
  type NumberField,
  type PointField,
  type RadioField,
  type RelationshipField,
  type RichTextField,
  type RowField,
  type SelectField,
  type TabsField,
  type TextareaField,
  type TextField,
  type UIField,
  type UploadField,
  type VectorField,
} from 'frogbot';
import { expectTypeOf } from 'vitest';

type Variants =
  | ArrayField
  | BlocksField
  | CheckboxField
  | CodeField
  | CollapsibleField
  | DateField
  | EmailField
  | GroupField
  | JoinField
  | JSONField
  | NumberField
  | PointField
  | RadioField
  | RelationshipField
  | RichTextField
  | RowField
  | SelectField
  | TabsField
  | TextareaField
  | TextField
  | UIField
  | UploadField
  | VectorField;

expectTypeOf<Variants>().toEqualTypeOf<Field>();

const textMany: TextField = {
  hasMany: true,
  maxRows: 3,
  name: 'tags',
  type: 'text',
};

expectTypeOf(textMany.hasMany).toEqualTypeOf<true>();

const vector: VectorField = {
  dimensions: 1536,
  name: 'embedding',
  required: true,
  type: 'vector',
  validate: (value) => {
    expectTypeOf(value).toEqualTypeOf<number[] | null | undefined>();

    return value === null || value === undefined || value.length === 1536
      ? true
      : 'Invalid vector.';
  },
};

expectTypeOf(vector).toMatchTypeOf<Field>();
expectTypeOf(vector.validate).toMatchTypeOf<VectorField['validate']>();
expectTypeOf<{ name: string; type: 'vector' }>().not.toMatchTypeOf<VectorField>();

type RichValue = { root: { children: unknown[] } };
type RichProps = { feature: string };
type RichExtra = { lexical: true };

const richText: RichTextField<RichValue, RichProps, RichExtra> = {
  lexical: true,
  name: 'content',
  type: 'richText',
};

expectTypeOf(richText.lexical).toEqualTypeOf<true>();
expectTypeOf<{
  hasMany: false;
  maxRows: number;
  name: string;
  type: 'text';
}>().not.toMatchTypeOf<TextField>();
