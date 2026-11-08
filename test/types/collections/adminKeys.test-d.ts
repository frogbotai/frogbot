import type { CollectionAdminConfig } from 'frogbot';
import type { CollectionConfig as PayloadCollectionConfig } from 'payload';

type PayloadAdmin = NonNullable<PayloadCollectionConfig['admin']>;

type Kept =
  | 'components'
  | 'custom'
  | 'description'
  | 'formatDocURL'
  | 'group'
  | 'hidden'
  | 'livePreview'
  | 'meta'
  | 'preview'
  | 'useAsThumbnail'
  | 'useAsTitle';

type MovedToViews =
  'baseFilter' | 'baseListFilter' | 'defaultColumns' | 'listSearchableFields' | 'pagination';

type Dropped = 'disableCopyToLocale' | 'enableRichTextLink' | 'enableRichTextRelationship';

type FrogBotOnly = 'icon' | 'settings' | 'useAsDone' | 'views';

type Reviewed = Kept | MovedToViews | Dropped;

type None<T extends never> = T;

export type UnreviewedPayloadKeys = None<Exclude<keyof PayloadAdmin, Reviewed>>;

export type RemovedPayloadKeys = None<Exclude<Reviewed, keyof PayloadAdmin>>;

export type UnexpectedFrogBotKeys = None<Exclude<keyof CollectionAdminConfig, Kept | FrogBotOnly>>;

export type MissingFrogBotKeys = None<Exclude<Kept | FrogBotOnly, keyof CollectionAdminConfig>>;
