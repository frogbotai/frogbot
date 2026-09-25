import type * as Payload from 'payload';

import type { FrogBotRequest } from '../../types/request.js';

type ServerProps<T> = Omit<T, 'payload' | 'req'> & { req: FrogBotRequest };

type ServerComponent<T> = T extends (props: infer TProps) => infer TResult
  ? (props: ServerProps<TProps>) => TResult
  : never;

export type ArrayFieldServerProps = ServerProps<Payload.ArrayFieldServerProps>;
export type ArrayFieldServerComponent = ServerComponent<Payload.ArrayFieldServerComponent>;
export type ArrayFieldLabelServerComponent =
  ServerComponent<Payload.ArrayFieldLabelServerComponent>;
export type ArrayFieldDescriptionServerComponent =
  ServerComponent<Payload.ArrayFieldDescriptionServerComponent>;
export type ArrayFieldErrorServerComponent =
  ServerComponent<Payload.ArrayFieldErrorServerComponent>;
export type ArrayFieldDiffServerComponent = ServerComponent<Payload.ArrayFieldDiffServerComponent>;

export type BlocksFieldServerProps = ServerProps<Payload.BlocksFieldServerProps>;
export type BlocksFieldServerComponent = ServerComponent<Payload.BlocksFieldServerComponent>;
export type BlocksFieldLabelServerComponent =
  ServerComponent<Payload.BlocksFieldLabelServerComponent>;
export type BlocksFieldDescriptionServerComponent =
  ServerComponent<Payload.BlocksFieldDescriptionServerComponent>;
export type BlocksFieldErrorServerComponent =
  ServerComponent<Payload.BlocksFieldErrorServerComponent>;
export type BlocksFieldDiffServerComponent =
  ServerComponent<Payload.BlocksFieldDiffServerComponent>;
export type BlockRowLabelServerComponent = ServerComponent<Payload.BlockRowLabelServerComponent>;

export type CheckboxFieldServerProps = ServerProps<Payload.CheckboxFieldServerProps>;
export type CheckboxFieldServerComponent = ServerComponent<Payload.CheckboxFieldServerComponent>;
export type CheckboxFieldLabelServerComponent =
  ServerComponent<Payload.CheckboxFieldLabelServerComponent>;
export type CheckboxFieldDescriptionServerComponent =
  ServerComponent<Payload.CheckboxFieldDescriptionServerComponent>;
export type CheckboxFieldErrorServerComponent =
  ServerComponent<Payload.CheckboxFieldErrorServerComponent>;
export type CheckboxFieldDiffServerComponent =
  ServerComponent<Payload.CheckboxFieldDiffServerComponent>;

export type CodeFieldServerProps = ServerProps<Payload.CodeFieldServerProps>;
export type CodeFieldServerComponent = ServerComponent<Payload.CodeFieldServerComponent>;
export type CodeFieldLabelServerComponent = ServerComponent<Payload.CodeFieldLabelServerComponent>;
export type CodeFieldDescriptionServerComponent =
  ServerComponent<Payload.CodeFieldDescriptionServerComponent>;
export type CodeFieldErrorServerComponent = ServerComponent<Payload.CodeFieldErrorServerComponent>;
export type CodeFieldDiffServerComponent = ServerComponent<Payload.CodeFieldDiffServerComponent>;

export type CollapsibleFieldServerProps = ServerProps<Payload.CollapsibleFieldServerProps>;
export type CollapsibleFieldServerComponent =
  ServerComponent<Payload.CollapsibleFieldServerComponent>;
export type CollapsibleFieldLabelServerComponent =
  ServerComponent<Payload.CollapsibleFieldLabelServerComponent>;
export type CollapsibleFieldDescriptionServerComponent =
  ServerComponent<Payload.CollapsibleFieldDescriptionServerComponent>;
export type CollapsibleFieldErrorServerComponent =
  ServerComponent<Payload.CollapsibleFieldErrorServerComponent>;
export type CollapsibleFieldDiffServerComponent =
  ServerComponent<Payload.CollapsibleFieldDiffServerComponent>;

export type DateFieldServerProps = ServerProps<Payload.DateFieldServerProps>;
export type DateFieldServerComponent = ServerComponent<Payload.DateFieldServerComponent>;
export type DateFieldLabelServerComponent = ServerComponent<Payload.DateFieldLabelServerComponent>;
export type DateFieldDescriptionServerComponent =
  ServerComponent<Payload.DateFieldDescriptionServerComponent>;
export type DateFieldErrorServerComponent = ServerComponent<Payload.DateFieldErrorServerComponent>;
export type DateFieldDiffServerComponent = ServerComponent<Payload.DateFieldDiffServerComponent>;

export type EmailFieldServerProps = ServerProps<Payload.EmailFieldServerProps>;
export type EmailFieldServerComponent = ServerComponent<Payload.EmailFieldServerComponent>;
export type EmailFieldLabelServerComponent =
  ServerComponent<Payload.EmailFieldLabelServerComponent>;
export type EmailFieldDescriptionServerComponent =
  ServerComponent<Payload.EmailFieldDescriptionServerComponent>;
export type EmailFieldErrorServerComponent =
  ServerComponent<Payload.EmailFieldErrorServerComponent>;
export type EmailFieldDiffServerComponent = ServerComponent<Payload.EmailFieldDiffServerComponent>;

export type GroupFieldServerProps = ServerProps<Payload.GroupFieldServerProps>;
export type GroupFieldServerComponent = ServerComponent<Payload.GroupFieldServerComponent>;
export type GroupFieldLabelServerComponent =
  ServerComponent<Payload.GroupFieldLabelServerComponent>;
export type GroupFieldDescriptionServerComponent =
  ServerComponent<Payload.GroupFieldDescriptionServerComponent>;
export type GroupFieldErrorServerComponent =
  ServerComponent<Payload.GroupFieldErrorServerComponent>;
export type GroupFieldDiffServerComponent = ServerComponent<Payload.GroupFieldDiffServerComponent>;

export type JSONFieldServerProps = ServerProps<Payload.JSONFieldServerProps>;
export type JSONFieldServerComponent = ServerComponent<Payload.JSONFieldServerComponent>;
export type JSONFieldLabelServerComponent = ServerComponent<Payload.JSONFieldLabelServerComponent>;
export type JSONFieldDescriptionServerComponent =
  ServerComponent<Payload.JSONFieldDescriptionServerComponent>;
export type JSONFieldErrorServerComponent = ServerComponent<Payload.JSONFieldErrorServerComponent>;
export type JSONFieldDiffServerComponent = ServerComponent<Payload.JSONFieldDiffServerComponent>;

export type JoinFieldServerProps = ServerProps<Payload.JoinFieldServerProps>;
export type JoinFieldServerComponent = ServerComponent<Payload.JoinFieldServerComponent>;
export type JoinFieldLabelServerComponent = ServerComponent<Payload.JoinFieldLabelServerComponent>;
export type JoinFieldDescriptionServerComponent =
  ServerComponent<Payload.JoinFieldDescriptionServerComponent>;
export type JoinFieldErrorServerComponent = ServerComponent<Payload.JoinFieldErrorServerComponent>;
export type JoinFieldDiffServerComponent = ServerComponent<Payload.JoinFieldDiffServerComponent>;

export type NumberFieldServerProps = ServerProps<Payload.NumberFieldServerProps>;
export type NumberFieldServerComponent = ServerComponent<Payload.NumberFieldServerComponent>;
export type NumberFieldLabelServerComponent =
  ServerComponent<Payload.NumberFieldLabelServerComponent>;
export type NumberFieldDescriptionServerComponent =
  ServerComponent<Payload.NumberFieldDescriptionServerComponent>;
export type NumberFieldErrorServerComponent =
  ServerComponent<Payload.NumberFieldErrorServerComponent>;
export type NumberFieldDiffServerComponent =
  ServerComponent<Payload.NumberFieldDiffServerComponent>;

export type PointFieldServerProps = ServerProps<Payload.PointFieldServerProps>;
export type PointFieldServerComponent = ServerComponent<Payload.PointFieldServerComponent>;
export type PointFieldLabelServerComponent =
  ServerComponent<Payload.PointFieldLabelServerComponent>;
export type PointFieldDescriptionServerComponent =
  ServerComponent<Payload.PointFieldDescriptionServerComponent>;
export type PointFieldErrorServerComponent =
  ServerComponent<Payload.PointFieldErrorServerComponent>;
export type PointFieldDiffServerComponent = ServerComponent<Payload.PointFieldDiffServerComponent>;

export type RadioFieldServerProps = ServerProps<Payload.RadioFieldServerProps>;
export type RadioFieldServerComponent = ServerComponent<Payload.RadioFieldServerComponent>;
export type RadioFieldLabelServerComponent =
  ServerComponent<Payload.RadioFieldLabelServerComponent>;
export type RadioFieldDescriptionServerComponent =
  ServerComponent<Payload.RadioFieldDescriptionServerComponent>;
export type RadioFieldErrorServerComponent =
  ServerComponent<Payload.RadioFieldErrorServerComponent>;
export type RadioFieldDiffServerComponent = ServerComponent<Payload.RadioFieldDiffServerComponent>;

export type RelationshipFieldServerProps = ServerProps<Payload.RelationshipFieldServerProps>;
export type RelationshipFieldServerComponent =
  ServerComponent<Payload.RelationshipFieldServerComponent>;
export type RelationshipFieldLabelServerComponent =
  ServerComponent<Payload.RelationshipFieldLabelServerComponent>;
export type RelationshipFieldDescriptionServerComponent =
  ServerComponent<Payload.RelationshipFieldDescriptionServerComponent>;
export type RelationshipFieldErrorServerComponent =
  ServerComponent<Payload.RelationshipFieldErrorServerComponent>;
export type RelationshipFieldDiffServerComponent =
  ServerComponent<Payload.RelationshipFieldDiffServerComponent>;

export type RichTextFieldServerProps = ServerProps<Payload.RichTextFieldServerProps>;
export type RichTextFieldServerComponent = ServerComponent<Payload.RichTextFieldServerComponent>;
export type RichTextFieldLabelServerComponent =
  ServerComponent<Payload.RichTextFieldLabelServerComponent>;
export type RichTextFieldDescriptionServerComponent =
  ServerComponent<Payload.RichTextFieldDescriptionServerComponent>;
export type RichTextFieldErrorServerComponent =
  ServerComponent<Payload.RichTextFieldErrorServerComponent>;
export type RichTextFieldDiffServerComponent =
  ServerComponent<Payload.RichTextFieldDiffServerComponent>;

export type RowFieldServerProps = ServerProps<Payload.RowFieldServerProps>;
export type RowFieldServerComponent = ServerComponent<Payload.RowFieldServerComponent>;
export type RowFieldLabelServerComponent = ServerComponent<Payload.RowFieldLabelServerComponent>;
export type RowFieldDescriptionServerComponent =
  ServerComponent<Payload.RowFieldDescriptionServerComponent>;
export type RowFieldErrorServerComponent = ServerComponent<Payload.RowFieldErrorServerComponent>;
export type RowFieldDiffServerComponent = ServerComponent<Payload.RowFieldDiffServerComponent>;

export type SelectFieldServerProps = ServerProps<Payload.SelectFieldServerProps>;
export type SelectFieldServerComponent = ServerComponent<Payload.SelectFieldServerComponent>;
export type SelectFieldLabelServerComponent =
  ServerComponent<Payload.SelectFieldLabelServerComponent>;
export type SelectFieldDescriptionServerComponent =
  ServerComponent<Payload.SelectFieldDescriptionServerComponent>;
export type SelectFieldErrorServerComponent =
  ServerComponent<Payload.SelectFieldErrorServerComponent>;
export type SelectFieldDiffServerComponent =
  ServerComponent<Payload.SelectFieldDiffServerComponent>;

export type TabsFieldServerProps = ServerProps<Payload.TabsFieldServerProps>;
export type TabsFieldServerComponent = ServerComponent<Payload.TabsFieldServerComponent>;
export type TabsFieldLabelServerComponent = ServerComponent<Payload.TabsFieldLabelServerComponent>;
export type TabsFieldDescriptionServerComponent =
  ServerComponent<Payload.TabsFieldDescriptionServerComponent>;
export type TabsFieldErrorServerComponent = ServerComponent<Payload.TabsFieldErrorServerComponent>;
export type TabsFieldDiffServerComponent = ServerComponent<Payload.TabsFieldDiffServerComponent>;

export type TextFieldServerProps = ServerProps<Payload.TextFieldServerProps>;
export type TextFieldServerComponent = ServerComponent<Payload.TextFieldServerComponent>;
export type TextFieldLabelServerComponent = ServerComponent<Payload.TextFieldLabelServerComponent>;
export type TextFieldDescriptionServerComponent =
  ServerComponent<Payload.TextFieldDescriptionServerComponent>;
export type TextFieldErrorServerComponent = ServerComponent<Payload.TextFieldErrorServerComponent>;
export type TextFieldDiffServerComponent = ServerComponent<Payload.TextFieldDiffServerComponent>;

export type TextareaFieldServerProps = ServerProps<Payload.TextareaFieldServerProps>;
export type TextareaFieldServerComponent = ServerComponent<Payload.TextareaFieldServerComponent>;
export type TextareaFieldLabelServerComponent =
  ServerComponent<Payload.TextareaFieldLabelServerComponent>;
export type TextareaFieldDescriptionServerComponent =
  ServerComponent<Payload.TextareaFieldDescriptionServerComponent>;
export type TextareaFieldErrorServerComponent =
  ServerComponent<Payload.TextareaFieldErrorServerComponent>;
export type TextareaFieldDiffServerComponent =
  ServerComponent<Payload.TextareaFieldDiffServerComponent>;

export type UIFieldServerProps = ServerProps<Payload.UIFieldServerProps>;
export type UIFieldServerComponent = ServerComponent<Payload.UIFieldServerComponent>;
export type UIFieldDiffServerComponent = ServerComponent<Payload.UIFieldDiffServerComponent>;

export type UploadFieldServerProps = ServerProps<Payload.UploadFieldServerProps>;
export type UploadFieldServerComponent = ServerComponent<Payload.UploadFieldServerComponent>;
export type UploadFieldLabelServerComponent =
  ServerComponent<Payload.UploadFieldLabelServerComponent>;
export type UploadFieldDescriptionServerComponent =
  ServerComponent<Payload.UploadFieldDescriptionServerComponent>;
export type UploadFieldErrorServerComponent =
  ServerComponent<Payload.UploadFieldErrorServerComponent>;
export type UploadFieldDiffServerComponent =
  ServerComponent<Payload.UploadFieldDiffServerComponent>;

export type {
  ArrayFieldClientComponent,
  ArrayFieldClientProps,
  ArrayFieldDescriptionClientComponent,
  ArrayFieldDiffClientComponent,
  ArrayFieldErrorClientComponent,
  ArrayFieldLabelClientComponent,
  BlockRowLabelClientComponent,
  BlocksFieldClientComponent,
  BlocksFieldClientProps,
  BlocksFieldDescriptionClientComponent,
  BlocksFieldDiffClientComponent,
  BlocksFieldErrorClientComponent,
  BlocksFieldLabelClientComponent,
  CheckboxFieldClientComponent,
  CheckboxFieldClientProps,
  CheckboxFieldDescriptionClientComponent,
  CheckboxFieldDiffClientComponent,
  CheckboxFieldErrorClientComponent,
  CheckboxFieldLabelClientComponent,
  CodeFieldClientComponent,
  CodeFieldClientProps,
  CodeFieldDescriptionClientComponent,
  CodeFieldDiffClientComponent,
  CodeFieldErrorClientComponent,
  CodeFieldLabelClientComponent,
  CollapsibleFieldClientComponent,
  CollapsibleFieldClientProps,
  CollapsibleFieldDescriptionClientComponent,
  CollapsibleFieldDiffClientComponent,
  CollapsibleFieldErrorClientComponent,
  CollapsibleFieldLabelClientComponent,
  DateFieldClientComponent,
  DateFieldClientProps,
  DateFieldDescriptionClientComponent,
  DateFieldDiffClientComponent,
  DateFieldErrorClientComponent,
  DateFieldLabelClientComponent,
  EmailFieldClientComponent,
  EmailFieldClientProps,
  EmailFieldDescriptionClientComponent,
  EmailFieldDiffClientComponent,
  EmailFieldErrorClientComponent,
  EmailFieldLabelClientComponent,
  GroupFieldClientComponent,
  GroupFieldClientProps,
  GroupFieldDescriptionClientComponent,
  GroupFieldDiffClientComponent,
  GroupFieldErrorClientComponent,
  GroupFieldLabelClientComponent,
  HiddenFieldProps,
  JoinFieldClientComponent,
  JoinFieldClientProps,
  JoinFieldDescriptionClientComponent,
  JoinFieldDiffClientComponent,
  JoinFieldErrorClientComponent,
  JoinFieldLabelClientComponent,
  JSONFieldClientComponent,
  JSONFieldClientProps,
  JSONFieldDescriptionClientComponent,
  JSONFieldDiffClientComponent,
  JSONFieldErrorClientComponent,
  JSONFieldLabelClientComponent,
  NumberFieldClientComponent,
  NumberFieldClientProps,
  NumberFieldDescriptionClientComponent,
  NumberFieldDiffClientComponent,
  NumberFieldErrorClientComponent,
  NumberFieldLabelClientComponent,
  PointFieldClientComponent,
  PointFieldClientProps,
  PointFieldDescriptionClientComponent,
  PointFieldDiffClientComponent,
  PointFieldErrorClientComponent,
  PointFieldLabelClientComponent,
  RadioFieldClientComponent,
  RadioFieldClientProps,
  RadioFieldDescriptionClientComponent,
  RadioFieldDiffClientComponent,
  RadioFieldErrorClientComponent,
  RadioFieldLabelClientComponent,
  RelationshipFieldClientComponent,
  RelationshipFieldClientProps,
  RelationshipFieldDescriptionClientComponent,
  RelationshipFieldDiffClientComponent,
  RelationshipFieldErrorClientComponent,
  RelationshipFieldLabelClientComponent,
  RichTextFieldClientComponent,
  RichTextFieldClientProps,
  RichTextFieldDescriptionClientComponent,
  RichTextFieldDiffClientComponent,
  RichTextFieldErrorClientComponent,
  RichTextFieldLabelClientComponent,
  RowFieldClientComponent,
  RowFieldClientProps,
  RowFieldDescriptionClientComponent,
  RowFieldDiffClientComponent,
  RowFieldErrorClientComponent,
  RowFieldLabelClientComponent,
  SelectFieldClientComponent,
  SelectFieldClientProps,
  SelectFieldDescriptionClientComponent,
  SelectFieldDiffClientComponent,
  SelectFieldErrorClientComponent,
  SelectFieldLabelClientComponent,
  TabsFieldClientComponent,
  TabsFieldClientProps,
  TabsFieldDescriptionClientComponent,
  TabsFieldDiffClientComponent,
  TabsFieldErrorClientComponent,
  TabsFieldLabelClientComponent,
  TextareaFieldClientComponent,
  TextareaFieldClientProps,
  TextareaFieldDescriptionClientComponent,
  TextareaFieldDiffClientComponent,
  TextareaFieldErrorClientComponent,
  TextareaFieldLabelClientComponent,
  TextFieldClientComponent,
  TextFieldClientProps,
  TextFieldDescriptionClientComponent,
  TextFieldDiffClientComponent,
  TextFieldErrorClientComponent,
  TextFieldLabelClientComponent,
  UIFieldClientComponent,
  UIFieldClientProps,
  UIFieldDiffClientComponent,
  UploadFieldClientComponent,
  UploadFieldClientProps,
  UploadFieldDescriptionClientComponent,
  UploadFieldDiffClientComponent,
  UploadFieldErrorClientComponent,
  UploadFieldLabelClientComponent,
} from 'payload';
