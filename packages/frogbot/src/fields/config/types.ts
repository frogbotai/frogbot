import type {
  ArrayField as PayloadArrayField,
  Block as PayloadBlock,
  BlocksField as PayloadBlocksField,
  CheckboxField as PayloadCheckboxField,
  CodeField as PayloadCodeField,
  CollapsibleField as PayloadCollapsibleField,
  DateField as PayloadDateField,
  EmailField as PayloadEmailField,
  JoinField as PayloadJoinField,
  JSONField as PayloadJSONField,
  NamedGroupField as PayloadNamedGroupField,
  NamedTab as PayloadNamedTab,
  NumberField as PayloadNumberField,
  PointField as PayloadPointField,
  RadioField as PayloadRadioField,
  RelationshipField as PayloadRelationshipField,
  RequestContext,
  RichTextField as PayloadRichTextField,
  RowField as PayloadRowField,
  SanitizedCollectionConfig,
  SelectField as PayloadSelectField,
  TabAsField as PayloadTabAsField,
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
import type { FrogbotRequest } from '../../types/request.js';

export interface FieldHookArgs<TData extends TypeWithID = any, TValue = any, TSiblingData = any> {
  collection: null | SanitizedCollectionConfig;
  context: RequestContext;
  data?: Partial<TData>;
  field: any;
  operation?: 'create' | 'delete' | 'read' | 'update';
  originalDoc?: TData;
  overrideAccess?: boolean;
  previousDoc?: TData;
  previousSiblingDoc?: TSiblingData;
  previousValue?: TValue;
  req: FrogbotRequest;
  siblingData: Partial<TSiblingData>;
  siblingFields?: (Field | TabAsField)[];
  value?: TValue;
}

export type FieldHook<TData extends TypeWithID = any, TValue = any, TSiblingData = any> = (
  args: FieldHookArgs<TData, TValue, TSiblingData>,
) => Promise<TValue> | TValue;

export type ValidateOptions<TData = any, TSiblingData = any, TValue = any> = {
  data: Partial<TData>;
  event?: 'onChange' | 'submit';
  id?: number | string;
  operation?: 'create' | 'update';
  path: (number | string)[];
  previousValue?: TValue;
  req: FrogbotRequest;
  required?: boolean;
  siblingData: Partial<TSiblingData>;
};

export type Validate<TValue = any, TData = any, TSiblingData = any> = (
  value: null | TValue | undefined,
  options: ValidateOptions<TData, TSiblingData, TValue>,
) => Promise<string | true> | string | true;

type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

type FieldHookWithSiblingFields = (
  args: FieldHookArgs & { siblingFields: (Field | TabAsField)[] },
) => ReturnType<FieldHook>;

type FieldHooks = {
  hooks?: {
    afterChange?: FieldHook[];
    afterRead?: FieldHookWithSiblingFields[];
    beforeChange?: FieldHookWithSiblingFields[];
    beforeDuplicate?: FieldHookWithSiblingFields[];
    beforeValidate?: FieldHookWithSiblingFields[];
  };
};

type FieldAccessConfig = {
  access?: {
    create?: FieldAccess;
    read?: FieldAccess;
    update?: FieldAccess;
  };
};

type FieldValidateConfig = {
  validate?: Validate;
};

type RetypedField<T> = DistributiveOmit<T, 'access' | 'hooks' | 'validate'> &
  FieldHooks &
  FieldAccessConfig &
  FieldValidateConfig;

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
export type CollapsibleField = RetypedField<Omit<PayloadCollapsibleField, 'fields'>> &
  FieldContainer;
export type DateField = RetypedField<PayloadDateField>;
export type EmailField = RetypedField<PayloadEmailField>;
export type JoinField = RetypedField<PayloadJoinField>;
export type JSONField = RetypedField<PayloadJSONField>;
export type NumberField = RetypedField<PayloadNumberField>;
export type PointField = RetypedField<PayloadPointField>;
export type RadioField = RetypedField<PayloadRadioField>;
export type RelationshipField = RetypedField<PayloadRelationshipField>;
export type RowField = RetypedField<Omit<PayloadRowField, 'fields'>> & FieldContainer;
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

export type NamedTab = RetypedField<Omit<PayloadNamedTab, 'fields'>> & FieldContainer;
export type UnnamedTab = RetypedField<Omit<PayloadUnnamedTab, 'fields'>> & FieldContainer;
export type Tab = NamedTab | UnnamedTab;
export type TabAsField = RetypedField<Omit<PayloadTabAsField, 'fields'>> & FieldContainer;
export type TabsField = RetypedField<Omit<PayloadTabsField, 'tabs'>> & TabList;

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
  const normalized = field.admin ? field : { ...field, admin: {} };

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
