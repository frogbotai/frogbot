import type { CollectionConfig, Field, FrogBotConfig } from 'frogbot';

/** A rich text editor, such as `lexicalEditor({ features: commentFeatures() })`. */
export type CommentsEditor = NonNullable<FrogBotConfig['editor']>;

/** Per-collection options when the plugin adds the comments field. */
export type CommentsCollectionOptions = {
  /** The editor for this collection's comments. Overrides the plugin's `editor`. */
  editor?: CommentsEditor;
};

/** Overrides for the comments collection, in Payload's collection-override shape. */
export type CommentsCollectionOverrides = Partial<Omit<CollectionConfig, 'fields'>> & {
  fields?: (args: { defaultFields: Field[] }) => Field[];
};

export type CommentsPluginOptions = {
  /**
   * Collections that get a comments field at the end of their fields, by slug, or a map from slug
   * to that collection's options. A collection that places `commentsField()` itself needs no entry.
   */
  collections?: string[] | Record<string, CommentsCollectionOptions | true>;
  /** The editor for every collection's comments. Default: the app's `editor`, plus mentions. */
  editor?: CommentsEditor;
  overrides?: CommentsCollectionOverrides;
};

/** What the plugin stores in the config's `custom`: the comments slug and each collection's body field. */
export type CommentsConfig = {
  bodies: Record<string, string>;
  commentsSlug: string;
  userSlug: string;
};
