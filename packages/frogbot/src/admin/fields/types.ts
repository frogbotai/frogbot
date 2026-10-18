import type * as Payload from 'payload';

import type { FrogBotRequest } from '../../types/request.js';

type ServerProps<T> = Omit<T, 'payload' | 'req'> & { req: FrogBotRequest };

export type ArrayFieldDescriptionServerProps =
  ServerProps<Payload.ArrayFieldDescriptionServerProps>;

export type ArrayFieldDiffServerProps = ServerProps<Payload.ArrayFieldDiffServerProps>;

export type ArrayFieldErrorServerProps = ServerProps<Payload.ArrayFieldErrorServerProps>;

export type ArrayFieldLabelServerProps = ServerProps<Payload.ArrayFieldLabelServerProps>;

export type ArrayFieldServerProps = ServerProps<Payload.ArrayFieldServerProps>;

export type BlockRowLabelServerProps = ServerProps<Payload.BlockRowLabelServerProps>;

export type BlocksFieldDescriptionServerProps =
  ServerProps<Payload.BlocksFieldDescriptionServerProps>;

export type BlocksFieldDiffServerProps = ServerProps<Payload.BlocksFieldDiffServerProps>;

export type BlocksFieldErrorServerProps = ServerProps<Payload.BlocksFieldErrorServerProps>;

export type BlocksFieldLabelServerProps = ServerProps<Payload.BlocksFieldLabelServerProps>;

export type BlocksFieldServerProps = ServerProps<Payload.BlocksFieldServerProps>;

export type CheckboxFieldDescriptionServerProps =
  ServerProps<Payload.CheckboxFieldDescriptionServerProps>;

export type CheckboxFieldDiffServerProps = ServerProps<Payload.CheckboxFieldDiffServerProps>;

export type CheckboxFieldErrorServerProps = ServerProps<Payload.CheckboxFieldErrorServerProps>;

export type CheckboxFieldLabelServerProps = ServerProps<Payload.CheckboxFieldLabelServerProps>;

export type CheckboxFieldServerProps = ServerProps<Payload.CheckboxFieldServerProps>;

export type CodeFieldDescriptionServerProps = ServerProps<Payload.CodeFieldDescriptionServerProps>;

export type CodeFieldDiffServerProps = ServerProps<Payload.CodeFieldDiffServerProps>;

export type CodeFieldErrorServerProps = ServerProps<Payload.CodeFieldErrorServerProps>;

export type CodeFieldLabelServerProps = ServerProps<Payload.CodeFieldLabelServerProps>;

export type CodeFieldServerProps = ServerProps<Payload.CodeFieldServerProps>;

export type CollapsibleFieldDescriptionServerProps =
  ServerProps<Payload.CollapsibleFieldDescriptionServerProps>;

export type CollapsibleFieldDiffServerProps = ServerProps<Payload.CollapsibleFieldDiffServerProps>;

export type CollapsibleFieldErrorServerProps =
  ServerProps<Payload.CollapsibleFieldErrorServerProps>;

export type CollapsibleFieldLabelServerProps =
  ServerProps<Payload.CollapsibleFieldLabelServerProps>;

export type CollapsibleFieldServerProps = ServerProps<Payload.CollapsibleFieldServerProps>;

export type DateFieldDescriptionServerProps = ServerProps<Payload.DateFieldDescriptionServerProps>;

export type DateFieldDiffServerProps = ServerProps<Payload.DateFieldDiffServerProps>;

export type DateFieldErrorServerProps = ServerProps<Payload.DateFieldErrorServerProps>;

export type DateFieldLabelServerProps = ServerProps<Payload.DateFieldLabelServerProps>;

export type DateFieldServerProps = ServerProps<Payload.DateFieldServerProps>;

export type EmailFieldDescriptionServerProps =
  ServerProps<Payload.EmailFieldDescriptionServerProps>;

export type EmailFieldDiffServerProps = ServerProps<Payload.EmailFieldDiffServerProps>;

export type EmailFieldErrorServerProps = ServerProps<Payload.EmailFieldErrorServerProps>;

export type EmailFieldLabelServerProps = ServerProps<Payload.EmailFieldLabelServerProps>;

export type EmailFieldServerProps = ServerProps<Payload.EmailFieldServerProps>;

export type GroupFieldDescriptionServerProps =
  ServerProps<Payload.GroupFieldDescriptionServerProps>;

export type GroupFieldDiffServerProps = ServerProps<Payload.GroupFieldDiffServerProps>;

export type GroupFieldErrorServerProps = ServerProps<Payload.GroupFieldErrorServerProps>;

export type GroupFieldLabelServerProps = ServerProps<Payload.GroupFieldLabelServerProps>;

export type GroupFieldServerProps = ServerProps<Payload.GroupFieldServerProps>;

export type JSONFieldDescriptionServerProps = ServerProps<Payload.JSONFieldDescriptionServerProps>;

export type JSONFieldDiffServerProps = ServerProps<Payload.JSONFieldDiffServerProps>;

export type JSONFieldErrorServerProps = ServerProps<Payload.JSONFieldErrorServerProps>;

export type JSONFieldLabelServerProps = ServerProps<Payload.JSONFieldLabelServerProps>;

export type JSONFieldServerProps = ServerProps<Payload.JSONFieldServerProps>;

export type JoinFieldDescriptionServerProps = ServerProps<Payload.JoinFieldDescriptionServerProps>;

export type JoinFieldDiffServerProps = ServerProps<Payload.JoinFieldDiffServerProps>;

export type JoinFieldErrorServerProps = ServerProps<Payload.JoinFieldErrorServerProps>;

export type JoinFieldLabelServerProps = ServerProps<Payload.JoinFieldLabelServerProps>;

export type JoinFieldServerProps = ServerProps<Payload.JoinFieldServerProps>;

export type NumberFieldDescriptionServerProps =
  ServerProps<Payload.NumberFieldDescriptionServerProps>;

export type NumberFieldDiffServerProps = ServerProps<Payload.NumberFieldDiffServerProps>;

export type NumberFieldErrorServerProps = ServerProps<Payload.NumberFieldErrorServerProps>;

export type NumberFieldLabelServerProps = ServerProps<Payload.NumberFieldLabelServerProps>;

export type NumberFieldServerProps = ServerProps<Payload.NumberFieldServerProps>;

export type PointFieldDescriptionServerProps =
  ServerProps<Payload.PointFieldDescriptionServerProps>;

export type PointFieldDiffServerProps = ServerProps<Payload.PointFieldDiffServerProps>;

export type PointFieldErrorServerProps = ServerProps<Payload.PointFieldErrorServerProps>;

export type PointFieldLabelServerProps = ServerProps<Payload.PointFieldLabelServerProps>;

export type PointFieldServerProps = ServerProps<Payload.PointFieldServerProps>;

export type RadioFieldDescriptionServerProps =
  ServerProps<Payload.RadioFieldDescriptionServerProps>;

export type RadioFieldDiffServerProps = ServerProps<Payload.RadioFieldDiffServerProps>;

export type RadioFieldErrorServerProps = ServerProps<Payload.RadioFieldErrorServerProps>;

export type RadioFieldLabelServerProps = ServerProps<Payload.RadioFieldLabelServerProps>;

export type RadioFieldServerProps = ServerProps<Payload.RadioFieldServerProps>;

export type RelationshipFieldDescriptionServerProps =
  ServerProps<Payload.RelationshipFieldDescriptionServerProps>;

export type RelationshipFieldDiffServerProps =
  ServerProps<Payload.RelationshipFieldDiffServerProps>;

export type RelationshipFieldErrorServerProps =
  ServerProps<Payload.RelationshipFieldErrorServerProps>;

export type RelationshipFieldLabelServerProps =
  ServerProps<Payload.RelationshipFieldLabelServerProps>;

export type RelationshipFieldServerProps = ServerProps<Payload.RelationshipFieldServerProps>;

export type RichTextFieldDescriptionServerProps =
  ServerProps<Payload.RichTextFieldDescriptionServerProps>;

export type RichTextFieldDiffServerProps = ServerProps<Payload.RichTextFieldDiffServerProps>;

export type RichTextFieldErrorServerProps = ServerProps<Payload.RichTextFieldErrorServerProps>;

export type RichTextFieldLabelServerProps = ServerProps<Payload.RichTextFieldLabelServerProps>;

export type RichTextFieldServerProps = ServerProps<Payload.RichTextFieldServerProps>;

export type RowFieldDescriptionServerProps = ServerProps<Payload.RowFieldDescriptionServerProps>;

export type RowFieldDiffServerProps = ServerProps<Payload.RowFieldDiffServerProps>;

export type RowFieldErrorServerProps = ServerProps<Payload.RowFieldErrorServerProps>;

export type RowFieldLabelServerProps = ServerProps<Payload.RowFieldLabelServerProps>;

export type RowFieldServerProps = ServerProps<Payload.RowFieldServerProps>;

export type SelectFieldDescriptionServerProps =
  ServerProps<Payload.SelectFieldDescriptionServerProps>;

export type SelectFieldDiffServerProps = ServerProps<Payload.SelectFieldDiffServerProps>;

export type SelectFieldErrorServerProps = ServerProps<Payload.SelectFieldErrorServerProps>;

export type SelectFieldLabelServerProps = ServerProps<Payload.SelectFieldLabelServerProps>;

export type SelectFieldServerProps = ServerProps<Payload.SelectFieldServerProps>;

export type TabsFieldDescriptionServerProps = ServerProps<Payload.TabsFieldDescriptionServerProps>;

export type TabsFieldDiffServerProps = ServerProps<Payload.TabsFieldDiffServerProps>;

export type TabsFieldErrorServerProps = ServerProps<Payload.TabsFieldErrorServerProps>;

export type TabsFieldLabelServerProps = ServerProps<Payload.TabsFieldLabelServerProps>;

export type TabsFieldServerProps = ServerProps<Payload.TabsFieldServerProps>;

export type TextFieldDescriptionServerProps = ServerProps<Payload.TextFieldDescriptionServerProps>;

export type TextFieldDiffServerProps = ServerProps<Payload.TextFieldDiffServerProps>;

export type TextFieldErrorServerProps = ServerProps<Payload.TextFieldErrorServerProps>;

export type TextFieldLabelServerProps = ServerProps<Payload.TextFieldLabelServerProps>;

export type TextFieldServerProps = ServerProps<Payload.TextFieldServerProps>;

export type TextareaFieldDescriptionServerProps =
  ServerProps<Payload.TextareaFieldDescriptionServerProps>;

export type TextareaFieldDiffServerProps = ServerProps<Payload.TextareaFieldDiffServerProps>;

export type TextareaFieldErrorServerProps = ServerProps<Payload.TextareaFieldErrorServerProps>;

export type TextareaFieldLabelServerProps = ServerProps<Payload.TextareaFieldLabelServerProps>;

export type TextareaFieldServerProps = ServerProps<Payload.TextareaFieldServerProps>;

export type UIFieldDiffServerProps = ServerProps<Payload.UIFieldDiffServerProps>;

export type UIFieldServerProps = ServerProps<Payload.UIFieldServerProps>;

export type UploadFieldDescriptionServerProps =
  ServerProps<Payload.UploadFieldDescriptionServerProps>;

export type UploadFieldDiffServerProps = ServerProps<Payload.UploadFieldDiffServerProps>;

export type UploadFieldErrorServerProps = ServerProps<Payload.UploadFieldErrorServerProps>;

export type UploadFieldLabelServerProps = ServerProps<Payload.UploadFieldLabelServerProps>;

export type UploadFieldServerProps = ServerProps<Payload.UploadFieldServerProps>;

export type {
  ArrayFieldClientProps,
  ArrayFieldDescriptionClientProps,
  ArrayFieldDiffClientProps,
  ArrayFieldErrorClientProps,
  ArrayFieldLabelClientProps,
  BlockRowLabelClientProps,
  BlocksFieldClientProps,
  BlocksFieldDescriptionClientProps,
  BlocksFieldDiffClientProps,
  BlocksFieldErrorClientProps,
  BlocksFieldLabelClientProps,
  CheckboxFieldClientProps,
  CheckboxFieldDescriptionClientProps,
  CheckboxFieldDiffClientProps,
  CheckboxFieldErrorClientProps,
  CheckboxFieldLabelClientProps,
  CodeFieldClientProps,
  CodeFieldDescriptionClientProps,
  CodeFieldDiffClientProps,
  CodeFieldErrorClientProps,
  CodeFieldLabelClientProps,
  CollapsibleFieldClientProps,
  CollapsibleFieldDescriptionClientProps,
  CollapsibleFieldDiffClientProps,
  CollapsibleFieldErrorClientProps,
  CollapsibleFieldLabelClientProps,
  DateFieldClientProps,
  DateFieldDescriptionClientProps,
  DateFieldDiffClientProps,
  DateFieldErrorClientProps,
  DateFieldLabelClientProps,
  EmailFieldClientProps,
  EmailFieldDescriptionClientProps,
  EmailFieldDiffClientProps,
  EmailFieldErrorClientProps,
  EmailFieldLabelClientProps,
  GroupFieldClientProps,
  GroupFieldDescriptionClientProps,
  GroupFieldDiffClientProps,
  GroupFieldErrorClientProps,
  GroupFieldLabelClientProps,
  JoinFieldClientProps,
  JoinFieldDescriptionClientProps,
  JoinFieldDiffClientProps,
  JoinFieldErrorClientProps,
  JoinFieldLabelClientProps,
  JSONFieldClientProps,
  JSONFieldDescriptionClientProps,
  JSONFieldDiffClientProps,
  JSONFieldErrorClientProps,
  JSONFieldLabelClientProps,
  NumberFieldClientProps,
  NumberFieldDescriptionClientProps,
  NumberFieldDiffClientProps,
  NumberFieldErrorClientProps,
  NumberFieldLabelClientProps,
  PointFieldClientProps,
  PointFieldDescriptionClientProps,
  PointFieldDiffClientProps,
  PointFieldErrorClientProps,
  PointFieldLabelClientProps,
  RadioFieldClientProps,
  RadioFieldDescriptionClientProps,
  RadioFieldDiffClientProps,
  RadioFieldErrorClientProps,
  RadioFieldLabelClientProps,
  RelationshipFieldClientProps,
  RelationshipFieldDescriptionClientProps,
  RelationshipFieldDiffClientProps,
  RelationshipFieldErrorClientProps,
  RelationshipFieldLabelClientProps,
  RichTextFieldClientProps,
  RichTextFieldDescriptionClientProps,
  RichTextFieldDiffClientProps,
  RichTextFieldErrorClientProps,
  RichTextFieldLabelClientProps,
  RowFieldClientProps,
  RowFieldDescriptionClientProps,
  RowFieldDiffClientProps,
  RowFieldErrorClientProps,
  RowFieldLabelClientProps,
  SelectFieldClientProps,
  SelectFieldDescriptionClientProps,
  SelectFieldDiffClientProps,
  SelectFieldErrorClientProps,
  SelectFieldLabelClientProps,
  TabsFieldClientProps,
  TabsFieldDescriptionClientProps,
  TabsFieldDiffClientProps,
  TabsFieldErrorClientProps,
  TabsFieldLabelClientProps,
  TextareaFieldClientProps,
  TextareaFieldDescriptionClientProps,
  TextareaFieldDiffClientProps,
  TextareaFieldErrorClientProps,
  TextareaFieldLabelClientProps,
  TextFieldClientProps,
  TextFieldDescriptionClientProps,
  TextFieldDiffClientProps,
  TextFieldErrorClientProps,
  TextFieldLabelClientProps,
  UIFieldClientProps,
  UIFieldDiffClientProps,
  UploadFieldClientProps,
  UploadFieldDescriptionClientProps,
  UploadFieldDiffClientProps,
  UploadFieldErrorClientProps,
  UploadFieldLabelClientProps,
} from 'payload';
