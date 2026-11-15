import { getTranslation, type I18nClient } from '@payloadcms/translations';

import { type PlacementProps, soleInTab } from './heading.js';
import { RecordComments, type RecordCommentsProps } from './RecordComments.js';

/** The server props Payload gives a field component that `CommentsField` reads. */
export type CommentsFieldProps = PlacementProps & {
  collectionSlug?: string;
  field?: { label?: Parameters<typeof getTranslation>[0] | false };
  i18n?: Pick<I18nClient, 'fallbackLanguage' | 'language' | 't'>;
  id?: number | string;
  req?: RecordCommentsProps['req'];
};

/**
 * The open record's comments and a box to add one. Shows the field's label as a heading, unless
 * it is the only field in a tab, whose label already names it. Renders nothing on a create form.
 */
export function CommentsField({
  collectionSlug,
  field,
  i18n,
  id,
  req,
  ...placement
}: CommentsFieldProps) {
  if (!req || !collectionSlug || id === undefined || id === null || id === '') return null;

  const label = field?.label;
  const heading =
    label === false || soleInTab(placement)
      ? undefined
      : label
        ? getTranslation(label, i18n as I18nClient)
        : 'Comments';

  return <RecordComments collection={collectionSlug} heading={heading} id={id} req={req} />;
}
