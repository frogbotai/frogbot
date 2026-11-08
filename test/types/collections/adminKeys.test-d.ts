import type { CollectionAdminConfig, CollectionView } from 'frogbot';
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

type FrogBotOnly = 'icon' | 'panel' | 'settings' | 'useAsDone' | 'views';

type Reviewed = Kept | MovedToViews | Dropped;

type None<T extends never> = T;

export type UnreviewedPayloadKeys = None<Exclude<keyof PayloadAdmin, Reviewed>>;

export type RemovedPayloadKeys = None<Exclude<Reviewed, keyof PayloadAdmin>>;

export type UnexpectedFrogBotKeys = None<Exclude<keyof CollectionAdminConfig, Kept | FrogBotOnly>>;

export type MissingFrogBotKeys = None<Exclude<Kept | FrogBotOnly, keyof CollectionAdminConfig>>;

export const plainFilter: CollectionView = {
  type: 'list',
  filter: { archived: { equals: false } },
};

// @ts-expect-error A view's filter is plain data, not a function.
export const functionFilter: CollectionView = { type: 'list', filter: () => ({}) };
