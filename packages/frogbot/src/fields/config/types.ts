import type {
  ArrayField as PayloadArrayField,
  BaseValidateOptions as PayloadBaseValidateOptions,
  Block as PayloadBlock,
  BlocksField as PayloadBlocksField,
  CheckboxField as PayloadCheckboxField,
  CodeField as PayloadCodeField,
  CollapsibleField as PayloadCollapsibleField,
  DateField as PayloadDateField,
  Document as PayloadDocument,
  EmailField as PayloadEmailField,
  FieldBase as PayloadFieldBase,
  FieldHookArgs as PayloadFieldHookArgs,
  JoinField as PayloadJoinField,
  JSONField as PayloadJSONField,
  NamedGroupField as PayloadNamedGroupField,
  NamedTab as PayloadNamedTab,
  NumberField as PayloadNumberField,
  OptionLabel as PayloadOptionLabel,
  PointField as PayloadPointField,
  RadioField as PayloadRadioField,
  RelationshipField as PayloadRelationshipField,
  RichTextField as PayloadRichTextField,
  RowField as PayloadRowField,
  SelectField as PayloadSelectField,
  TabsField as PayloadTabsField,
  TextareaField as PayloadTextareaField,
  TextField as PayloadTextField,
  TypeWithID,
  UIField as PayloadUIField,
  UnnamedGroupField as PayloadUnnamedGroupField,
  UnnamedTab as PayloadUnnamedTab,
  UploadField as PayloadUploadField,
  ValueWithRelation as PayloadValueWithRelation,
} from 'payload';
import {
  optionIsObject as payloadOptionIsObject,
  optionIsValue as payloadOptionIsValue,
  optionsAreObjects as payloadOptionsAreObjects,
  valueIsValueWithRelation as payloadValueIsValueWithRelation,
} from 'payload/shared';

import type { FieldAccess } from '../../collections/config/types.js';
import type { FrogBotArgs, FrogBotRequest } from '../../types/request.js';

export interface FieldHookArgs<
  TData extends TypeWithID = PayloadDocument,
  TValue = PayloadDocument,
  TSiblingData = PayloadDocument,
> extends Omit<
  PayloadFieldHookArgs<TData, TValue, TSiblingData>,
  'req' | 'field' | 'siblingFields'
> {
  req: FrogBotRequest;
  field: FieldAffectingData;
  siblingFields?: (Field | TabAsField)[];
}

export type FieldHook<
  TData extends TypeWithID = PayloadDocument,
  TValue = PayloadDocument,
  TSiblingData = PayloadDocument,
> = (args: FieldHookArgs<TData, TValue, TSiblingData>) => Promise<TValue> | TValue;

export type ValidateOptions<
  TData = PayloadDocument,
  TSiblingData = PayloadDocument,
  TFieldConfig extends object = object,
  TValue = PayloadDocument,
> = FrogBotArgs<PayloadBaseValidateOptions<TData, TSiblingData, TValue>> & TFieldConfig;

export type Validate<
  TValue = PayloadDocument,
  TData = PayloadDocument,
  TSiblingData = PayloadDocument,
  TFieldConfig extends object = object,
> = (
  value: null | TValue | undefined,
  options: ValidateOptions<TData, TSiblingData, TFieldConfig, TValue>,
) => Promise<string | true> | string | true;

type FieldHookWithSiblingFields = (
  args: FieldHookArgs & { siblingFields: (Field | TabAsField)[] },
) => ReturnType<FieldHook>;

type FieldHooks = {
  hooks?: {
    [
      TPhase in Exclude<keyof NonNullable<PayloadFieldBase['hooks']>, 'afterChange'>
    ]?: FieldHookWithSiblingFields[];
  } & {
    // Payload types siblingFields as required, but never passes it to afterChange hooks
    // (afterChange/traverseFields.ts forwards it without setting it from `fields`).
    // Make it required here once Payload fixes that.
    afterChange?: FieldHook[];
  };
};

type FieldAccessConfig = {
  access?: {
    create?: FieldAccess;
    read?: FieldAccess;
    update?: FieldAccess;
  };
};

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

type RetypedKey = 'access' | 'defaultValue' | 'filterOptions' | 'hooks' | 'validate';

type SwapReqArg<F> = F extends (args: infer A) => infer R ? (args: FrogBotArgs<A>) => R : F;

type KeySlot<T, K extends PropertyKey, S> = K extends keyof T ? S : unknown;

type RequestSlots<T> = KeySlot<
  T,
  'defaultValue',
  { defaultValue?: SwapReqArg<T['defaultValue' & keyof T]> }
> &
  KeySlot<T, 'filterOptions', { filterOptions?: SwapReqArg<T['filterOptions' & keyof T]> }>;

type ValidatorFieldConfig<T> = Omit<T, RetypedKey> & RequestSlots<T>;

type RetypedMember<T, TField> = T extends unknown
  ? Omit<T, RetypedKey> &
      RequestSlots<T> &
      KeySlot<T, 'hooks', FieldHooks> &
      KeySlot<T, 'access', FieldAccessConfig> &
      KeySlot<
        T,
        'validate',
        {
          validate?: Validate<
            PayloadDocument,
            PayloadDocument,
            PayloadDocument,
            ValidatorFieldConfig<TField>
          >;
        }
      >
  : never;

type RetypedField<T> = RetypedMember<T, T>;

type LayoutIgnoredKey =
  | 'access'
  | 'defaultValue'
  | 'hooks'
  | 'index'
  | 'required'
  | 'saveToJWT'
  | 'typescriptSchema'
  | 'unique'
  | 'validate';

interface FieldContainer {
  fields: Field[];
}

interface BlockList {
  blockReferences?: (Block | BlockReference)[];
  blocks: Block[];
}

interface TabList {
  tabs: Tab[];
}

export type ArrayField = RetypedField<Omit<PayloadArrayField, 'fields'>> & FieldContainer;
export type BlocksField = RetypedField<Omit<PayloadBlocksField, 'blockReferences' | 'blocks'>> &
  BlockList;
export type CheckboxField = RetypedField<PayloadCheckboxField>;
export type CodeField = RetypedField<PayloadCodeField>;
export type CollapsibleField = DistributiveOmit<
  PayloadCollapsibleField,
  'fields' | LayoutIgnoredKey
> &
  FieldContainer;
export type DateField = RetypedField<PayloadDateField>;
export type EmailField = RetypedField<PayloadEmailField>;
export type JoinField = RetypedField<PayloadJoinField>;
export type JSONField = RetypedField<PayloadJSONField>;
export type NumberField = RetypedField<PayloadNumberField>;
export type PointField = RetypedField<PayloadPointField>;
export type RadioField = RetypedField<Omit<PayloadRadioField, 'options'> & { options: Option[] }>;
export type RelationshipField = RetypedField<PayloadRelationshipField>;
export type RowField = Omit<PayloadRowField, 'fields' | LayoutIgnoredKey> & FieldContainer;
export type SelectField = RetypedField<
  DistributiveOmit<PayloadSelectField, 'options'> & { options: Option[] }
>;
export type TextareaField = RetypedField<PayloadTextareaField>;
export type TextField = RetypedField<PayloadTextField>;
export type UIField = RetypedField<PayloadUIField>;
export type UploadField = RetypedField<PayloadUploadField>;
export type VectorField = Omit<
  RetypedField<Omit<PayloadJSONField, 'jsonSchema' | 'type'>>,
  'validate'
> & {
  dimensions: number;
  type: 'vector';
  validate?: Validate<number[]>;
};

export type RichTextField<
  TValue extends object = PayloadDocument,
  TAdapterProps = PayloadDocument,
  TExtraProperties = object,
> = RetypedField<PayloadRichTextField<TValue, TAdapterProps, TExtraProperties>>;

export type NamedGroupField = RetypedField<Omit<PayloadNamedGroupField, 'fields'>> & FieldContainer;
export type UnnamedGroupField = RetypedField<Omit<PayloadUnnamedGroupField, 'fields'>> &
  FieldContainer;
export type GroupField = NamedGroupField | UnnamedGroupField;

export type NamedTab = RetypedField<Omit<PayloadNamedTab, 'fields' | 'index' | 'unique'>> &
  FieldContainer;
type UnnamedTabConfig = Omit<PayloadUnnamedTab, 'fields' | 'hidden' | LayoutIgnoredKey> &
  FieldContainer;
export type UnnamedTab = UnnamedTabConfig & {
  [K in Exclude<keyof NamedTab, keyof UnnamedTabConfig>]?: never;
};
export type Tab = NamedTab | UnnamedTab;
export type TabAsField = Tab & { type: 'tab' };
export type TabsField = Omit<PayloadTabsField, 'label' | 'tabs' | LayoutIgnoredKey> & TabList;

type BlockReference = Exclude<
  NonNullable<PayloadBlocksField['blockReferences']>[number],
  PayloadBlock
>;

export interface Block extends Omit<PayloadBlock, 'fields'> {
  fields: Field[];
}

export type Field =
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

export const optionColors = [
  'gray',
  'blue',
  'cyan',
  'teal',
  'green',
  'yellow',
  'orange',
  'red',
  'pink',
  'purple',
] as const;

export type OptionColor = (typeof optionColors)[number];

export type OptionObject = {
  color?: OptionColor;
  label: PayloadOptionLabel;
  value: string;
};

export type Option = OptionObject | string;

export type ValueWithRelation = PayloadValueWithRelation;

type FieldWithSubFields = ArrayField | CollapsibleField | GroupField | RowField;
type FieldWithMany = RelationshipField | SelectField | UploadField;
type FieldWithMaxDepth = JoinField | RelationshipField | UploadField;
type FieldAffectingData =
  Exclude<Extract<Field, { name: string }>, UIField> | (TabAsField & { name: string });

export function fieldHasSubFields<T extends Field | TabAsField>(
  field: T,
): field is T & FieldWithSubFields {
  return (
    field.type === 'group' ||
    field.type === 'array' ||
    field.type === 'row' ||
    field.type === 'collapsible'
  );
}

export function fieldIsArrayType<T extends Field>(field: T): field is T & ArrayField {
  return field.type === 'array';
}

export function fieldIsBlockType<T extends Field>(field: T): field is T & BlocksField {
  return field.type === 'blocks';
}

export function fieldIsGroupType<T extends Field>(field: T): field is T & GroupField {
  return field.type === 'group';
}

export function fieldSupportsMany<T extends Field>(field: T): field is T & FieldWithMany {
  return field.type === 'select' || field.type === 'relationship' || field.type === 'upload';
}

export function fieldHasMaxDepth<T extends Field>(
  field: T,
): field is T & FieldWithMaxDepth & { maxDepth: number } {
  return (
    (field.type === 'upload' || field.type === 'relationship' || field.type === 'join') &&
    typeof field.maxDepth === 'number'
  );
}

export function fieldIsPresentationalOnly<T extends Field | TabAsField>(
  field: T,
): field is T & UIField {
  return field.type === 'ui';
}

export function fieldIsSidebar<T extends Field | TabAsField>(
  field: T,
): field is T & { admin: { position: 'sidebar' } } {
  return field.admin?.position === 'sidebar';
}

export function fieldIsID<T extends Field>(field: T): field is T & { name: 'id' } {
  return 'name' in field && field.name === 'id';
}

export function fieldIsHiddenOrDisabled(field: Field | TabAsField): boolean {
  return Boolean(
    ('hidden' in field && field.hidden) ||
    (field.admin && 'disabled' in field.admin && field.admin.disabled),
  );
}

export function fieldAffectsData<T extends Field | TabAsField>(
  field: T,
): field is T & FieldAffectingData {
  return 'name' in field && !fieldIsPresentationalOnly(field);
}

export function tabHasName<T extends Tab>(tab: T): tab is T & NamedTab {
  return 'name' in tab;
}

export function groupHasName<T extends GroupField>(group: T): group is T & NamedGroupField {
  return 'name' in group;
}

export function fieldIsLocalized(field: Field | Tab): boolean {
  return 'localized' in field && Boolean(field.localized);
}

export function fieldShouldBeLocalized({
  field,
  parentIsLocalized,
}: {
  field: Field | Tab;
  parentIsLocalized: boolean;
}): boolean {
  return Boolean(
    'localized' in field &&
    field.localized &&
    (!parentIsLocalized ||
      process.env.NEXT_PUBLIC_PAYLOAD_COMPATIBILITY_allowLocalizedWithinLocalized === 'true'),
  );
}

export function fieldIsVirtual(field: Field | Tab): boolean {
  return 'virtual' in field && Boolean(field.virtual);
}

export function optionIsObject(option: Option): option is OptionObject {
  return payloadOptionIsObject(option);
}

export function optionsAreObjects(options: Option[]): options is OptionObject[] {
  return payloadOptionsAreObjects(options);
}

export function optionIsValue(option: Option): option is string {
  return payloadOptionIsValue(option);
}

export function valueIsValueWithRelation(value: unknown): value is ValueWithRelation {
  return payloadValueIsValueWithRelation(value);
}
