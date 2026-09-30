import type {
  GeneratedTypes,
  JsonObject,
  SelectType,
  Sort,
  TransformDataWithSelect,
  TypeWithID,
  Where,
} from 'frogbot';

import type { OperationArgs } from './utilities/buildSearchParams.js';

export type FrogBotTypesShape = {
  auth: Record<string, unknown>;
  collections: Record<string, unknown>;
  collectionsJoins: Record<string, unknown>;
  collectionsSelect: Record<string, unknown>;
  locale: unknown;
};

export type UntypedFrogBotSDKTypes = {
  auth: Record<string, unknown>;
  collections: Record<string, Record<string, unknown> & TypeWithID>;
  collectionsJoins: Record<string, unknown>;
  collectionsSelect: Record<string, unknown>;
  locale: unknown;
};

type IsUnresolved<T> = boolean extends (T extends never ? true : false) ? true : false;

type ResolveTypes<T> =
  IsUnresolved<T> extends true
    ? UntypedFrogBotSDKTypes
    : keyof T extends never
      ? UntypedFrogBotSDKTypes
      : T extends FrogBotTypesShape
        ? T
        : UntypedFrogBotSDKTypes;

export type DefaultTypes = ResolveTypes<GeneratedTypes>;

type StringKeyOf<T> = Extract<keyof T, string>;

export type CollectionSlug<T extends FrogBotTypesShape> = StringKeyOf<T['collections']>;

export type AuthCollectionSlug<T extends FrogBotTypesShape> = StringKeyOf<T['auth']>;

type UploadCollections<T extends FrogBotTypesShape> = {
  [
    TSlug in keyof T['collections'] as
      'filename' | 'filesize' | 'mimeType' | 'url' extends keyof T['collections'][TSlug]
      ? TSlug
      : never
  ]: T['collections'][TSlug];
};

export type UploadCollectionSlug<T extends FrogBotTypesShape> = StringKeyOf<UploadCollections<T>>;

export type TypedLocale<T extends FrogBotTypesShape> = T['locale'];

export type DataFromCollectionSlug<
  T extends FrogBotTypesShape,
  TSlug extends CollectionSlug<T>,
> = T['collections'][TSlug];

export type DataFromAuthSlug<
  T extends FrogBotTypesShape,
  TSlug extends AuthCollectionSlug<T>,
> = T['collections'][CollectionSlug<T> & TSlug];

export type SelectFromCollectionSlug<
  T extends FrogBotTypesShape,
  TSlug extends CollectionSlug<T>,
> = TSlug extends keyof T['collectionsSelect'] ? T['collectionsSelect'][TSlug] : SelectType;

export type TransformCollectionWithSelect<
  T extends FrogBotTypesShape,
  TSlug extends CollectionSlug<T>,
  TSelect,
> = TSelect extends SelectType
  ? TransformDataWithSelect<
      T['collections'][TSlug] extends JsonObject
        ? T['collections'][TSlug]
        : JsonObject & TypeWithID,
      TSelect
    >
  : T['collections'][TSlug];

type SystemFields = 'createdAt' | 'id' | 'sizes' | 'updatedAt';

export type RequiredDataFromCollection<TData> = Omit<TData, SystemFields> &
  Partial<Pick<Record<SystemFields, unknown> & TData, SystemFields>>;

export type RequiredDataFromCollectionSlug<
  T extends FrogBotTypesShape,
  TSlug extends CollectionSlug<T>,
> = RequiredDataFromCollection<T['collections'][TSlug]>;

type DeepPartialBuiltin =
  | Blob
  | Date
  | Error
  | ((...args: never[]) => unknown)
  | RegExp
  | bigint
  | boolean
  | number
  | string
  | symbol
  | null
  | undefined;

export type DeepPartial<T> = T extends DeepPartialBuiltin
  ? T
  : T extends ReadonlyArray<infer TItem>
    ? DeepPartial<TItem>[]
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

export type WhereFromCollectionSlug<
  T extends FrogBotTypesShape,
  TSlug extends CollectionSlug<T>,
> = {
  [K in StringKeyOf<DataFromCollectionSlug<T, TSlug>>]?: Where[string];
} & Where;

export type JoinQuery<T extends FrogBotTypesShape, TSlug extends CollectionSlug<T>> =
  T['collectionsJoins'][TSlug] extends Record<string, string>
    ? | false
      | Partial<{
          [K in keyof T['collectionsJoins'][TSlug]]:
            { count?: boolean; limit?: number; page?: number; sort?: Sort; where?: Where } | false;
        }>
    : never;

export type PopulateType<T extends FrogBotTypesShape> = Partial<T['collectionsSelect']>;

export type IDType<
  T extends FrogBotTypesShape,
  TSlug extends CollectionSlug<T>,
> = (T['collections'][TSlug] & TypeWithID)['id'];

export type BulkOperationResult<
  T extends FrogBotTypesShape,
  TSlug extends CollectionSlug<T>,
  TSelect,
> = {
  docs: TransformCollectionWithSelect<T, TSlug, TSelect>[];
  errors: { id: IDType<T, TSlug>; message: string }[];
};

export type FrogBotSDKSendArgs = {
  args?: OperationArgs;
  file?: Blob;
  init?: RequestInit;
  json?: unknown;
  method: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';
  path: string;
};

export type FrogBotSDKSend = (args: FrogBotSDKSendArgs) => Promise<Response>;
