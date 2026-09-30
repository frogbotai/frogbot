import {
  MetaDescriptionField as payloadMetaDescriptionField,
  MetaImageField as payloadMetaImageField,
  MetaTitleField as payloadMetaTitleField,
  OverviewField as payloadOverviewField,
  PreviewField as payloadPreviewField,
} from '@payloadcms/plugin-seo/fields';
import type { TextareaField, TextField, UIField, UploadField } from 'frogbot';

export type MetaTitleFieldArgs = Omit<Parameters<typeof payloadMetaTitleField>[0], 'overrides'> & {
  overrides?: Partial<TextField>;
};

export type MetaDescriptionFieldArgs = Omit<
  Parameters<typeof payloadMetaDescriptionField>[0],
  'overrides'
> & {
  overrides?: Partial<TextareaField>;
};

export type MetaImageFieldArgs = Omit<Parameters<typeof payloadMetaImageField>[0], 'overrides'> & {
  overrides?: Partial<UploadField>;
};

export type OverviewFieldArgs = Omit<Parameters<typeof payloadOverviewField>[0], 'overrides'> & {
  overrides?: Partial<UIField>;
};

export type PreviewFieldArgs = Omit<Parameters<typeof payloadPreviewField>[0], 'overrides'> & {
  overrides?: Partial<UIField>;
};

export function MetaTitleField(args: MetaTitleFieldArgs): TextField {
  return (payloadMetaTitleField as (args: MetaTitleFieldArgs) => TextField)(args);
}

export function MetaDescriptionField(args: MetaDescriptionFieldArgs): TextareaField {
  return (payloadMetaDescriptionField as (args: MetaDescriptionFieldArgs) => TextareaField)(args);
}

export function MetaImageField(args: MetaImageFieldArgs): UploadField {
  return (payloadMetaImageField as (args: MetaImageFieldArgs) => UploadField)(args);
}

export function OverviewField(args: OverviewFieldArgs): UIField {
  return (payloadOverviewField as (args: OverviewFieldArgs) => UIField)(args);
}

export function PreviewField(args: PreviewFieldArgs): UIField {
  return (payloadPreviewField as (args: PreviewFieldArgs) => UIField)(args);
}
