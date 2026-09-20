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
} from 'payload';

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
  siblingFields: (Field | TabAsField)[];
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

type FieldHooks = {
  hooks?: {
    afterChange?: FieldHook[];
    afterRead?: FieldHook[];
    beforeChange?: FieldHook[];
    beforeDuplicate?: FieldHook[];
    beforeValidate?: FieldHook[];
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
  | UploadField;
