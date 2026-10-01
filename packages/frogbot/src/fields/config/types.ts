import type {
  ArrayField as PayloadArrayField,
  BaseValidateOptions as PayloadBaseValidateOptions,
  Block as PayloadBlock,
  BlocksField as PayloadBlocksField,
  CheckboxField as PayloadCheckboxField,
  CodeField as PayloadCodeField,
  CollapsibleField as PayloadCollapsibleField,
  DateField as PayloadDateField,
  EmailField as PayloadEmailField,
  FieldBase as PayloadFieldBase,
  FieldHookArgs as PayloadFieldHookArgs,
  JoinField as PayloadJoinField,
  JSONField as PayloadJSONField,
  NamedGroupField as PayloadNamedGroupField,
  NamedTab as PayloadNamedTab,
  NumberField as PayloadNumberField,
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
  fieldAffectsData as payloadFieldAffectsData,
  fieldHasMaxDepth as payloadFieldHasMaxDepth,
  fieldHasSubFields as payloadFieldHasSubFields,
  fieldIsArrayType as payloadFieldIsArrayType,
  fieldIsBlockType as payloadFieldIsBlockType,
  fieldIsGroupType as payloadFieldIsGroupType,
  fieldIsHiddenOrDisabled as payloadFieldIsHiddenOrDisabled,
  fieldIsID as payloadFieldIsID,
  fieldIsLocalized as payloadFieldIsLocalized,
  fieldIsPresentationalOnly as payloadFieldIsPresentationalOnly,
  fieldIsSidebar as payloadFieldIsSidebar,
  fieldIsVirtual as payloadFieldIsVirtual,
  fieldShouldBeLocalized as payloadFieldShouldBeLocalized,
  fieldSupportsMany as payloadFieldSupportsMany,
  groupHasName as payloadGroupHasName,
  optionIsObject as payloadOptionIsObject,
  optionIsValue as payloadOptionIsValue,
  optionsAreObjects as payloadOptionsAreObjects,
  tabHasName as payloadTabHasName,
  valueIsValueWithRelation as payloadValueIsValueWithRelation,
} from 'payload/shared';

import type { FieldAccess } from '../../collections/config/types.js';
import type { FrogBotArgs, FrogBotRequest } from '../../types/request.js';

export interface FieldHookArgs<
  TData extends TypeWithID = any,
  TValue = any,
  TSiblingData = any,
> extends Omit<
  PayloadFieldHookArgs<TData, TValue, TSiblingData>,
  'req' | 'field' | 'siblingFields'
> {
  req: FrogBotRequest;
  field: FieldAffectingData;
  siblingFields?: (Field | TabAsField)[];
}

export type FieldHook<TData extends TypeWithID = any, TValue = any, TSiblingData = any> = (
  args: FieldHookArgs<TData, TValue, TSiblingData>,
) => Promise<TValue> | TValue;

export type ValidateOptions<
  TData = any,
  TSiblingData = any,
  TFieldConfig extends object = object,
  TValue = any,
> = FrogBotArgs<PayloadBaseValidateOptions<TData, TSiblingData, TValue>> & TFieldConfig;

export type Validate<
  TValue = any,
  TData = any,
  TSiblingData = any,
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

type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

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
      KeySlot<T, 'validate', { validate?: Validate<any, any, any, ValidatorFieldConfig<TField>> }>
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
export type RadioField = RetypedField<PayloadRadioField>;
export type RelationshipField = RetypedField<PayloadRelationshipField>;
export type RowField = Omit<PayloadRowField, 'fields' | LayoutIgnoredKey> & FieldContainer;
export type SelectField = RetypedField<PayloadSelectField>;
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
  TValue extends object = any,
  TAdapterProps = any,
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

export type OptionObject = {
  label: Record<string, string> | string;
  value: string;
};

export type Option = OptionObject | string;

export type ValueWithRelation = PayloadValueWithRelation;

type FieldWithSubFields = ArrayField | CollapsibleField | GroupField | RowField;
type FieldWithMany = RelationshipField | SelectField | UploadField;
type FieldWithMaxDepth = JoinField | RelationshipField | UploadField;
type FieldAffectingData =
  Exclude<Extract<Field, { name: string }>, UIField> | (TabAsField & { name: string });

const asPayloadField = (field: Field | Tab | TabAsField): any => field;

export function fieldHasSubFields<T extends Field | TabAsField>(
  field: T,
): field is T & FieldWithSubFields {
  return payloadFieldHasSubFields(asPayloadField(field));
}

export function fieldIsArrayType<T extends Field>(field: T): field is T & ArrayField {
  return payloadFieldIsArrayType(asPayloadField(field));
}

export function fieldIsBlockType<T extends Field>(field: T): field is T & BlocksField {
  return payloadFieldIsBlockType(asPayloadField(field));
}

export function fieldIsGroupType<T extends Field>(field: T): field is T & GroupField {
  return payloadFieldIsGroupType(asPayloadField(field));
}

export function fieldSupportsMany<T extends Field>(field: T): field is T & FieldWithMany {
  return payloadFieldSupportsMany(asPayloadField(field));
}

export function fieldHasMaxDepth<T extends Field>(
  field: T,
): field is T & FieldWithMaxDepth & { maxDepth: number } {
  return payloadFieldHasMaxDepth(asPayloadField(field));
}

export function fieldIsPresentationalOnly<T extends Field | TabAsField>(
  field: T,
): field is T & UIField {
  return payloadFieldIsPresentationalOnly(asPayloadField(field));
}

export function fieldIsSidebar<T extends Field | TabAsField>(
  field: T,
): field is T & { admin: { position: 'sidebar' } } {
  return Boolean(field.admin && payloadFieldIsSidebar(asPayloadField(field)));
}

export function fieldIsID<T extends Field>(field: T): field is T & { name: 'id' } {
  return payloadFieldIsID(asPayloadField(field));
}

export function fieldIsHiddenOrDisabled(field: Field | TabAsField): boolean {
  const normalized = field.admin ? field : ({ ...field, admin: {} } as Field | TabAsField);

  return Boolean(payloadFieldIsHiddenOrDisabled(asPayloadField(normalized)));
}

export function fieldAffectsData<T extends Field | TabAsField>(
  field: T,
): field is T & FieldAffectingData {
  return payloadFieldAffectsData(asPayloadField(field));
}

export function tabHasName<T extends Tab>(tab: T): tab is T & NamedTab {
  return payloadTabHasName(tab as never);
}

export function groupHasName<T extends GroupField>(group: T): group is T & NamedGroupField {
  return payloadGroupHasName(group as never);
}

export function fieldIsLocalized(field: Field | Tab): boolean {
  return Boolean(payloadFieldIsLocalized(field as never));
}

export function fieldShouldBeLocalized({
  field,
  parentIsLocalized,
}: {
  field: Field | Tab;
  parentIsLocalized: boolean;
}): boolean {
  return payloadFieldShouldBeLocalized({ field: field as never, parentIsLocalized });
}

export function fieldIsVirtual(field: Field | Tab): boolean {
  return Boolean(payloadFieldIsVirtual(field as never));
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
