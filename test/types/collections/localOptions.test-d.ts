import type {
  AuthArgs,
  CountArgs,
  CreateArgs,
  DeleteByIDArgs,
  DeleteManyArgs,
  DocID,
  DuplicateArgs,
  FindArgs,
  FindByIDArgs,
  FindDistinctArgs,
  UpdateByIDArgs,
  UpdateManyArgs,
} from 'frogbot';
import { expectTypeOf } from 'vitest';

import { postsSlug } from '../../select/shared.js';

type Slug = typeof postsSlug;

expectTypeOf<UpdateByIDArgs<Slug>['overrideLock']>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<UpdateManyArgs<Slug>['overrideLock']>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<DeleteByIDArgs<Slug>['overrideLock']>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<DeleteManyArgs<Slug>['overrideLock']>().toEqualTypeOf<boolean | undefined>();

expectTypeOf<CreateArgs<Slug>['disableTransaction']>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<UpdateByIDArgs<Slug>['disableTransaction']>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<UpdateManyArgs<Slug>['disableTransaction']>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<DeleteByIDArgs<Slug>['disableTransaction']>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<DeleteManyArgs<Slug>['disableTransaction']>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<DuplicateArgs<Slug>['disableTransaction']>().toEqualTypeOf<boolean | undefined>();

export const findLock: FindArgs<Slug> = {
  collection: postsSlug,
  // @ts-expect-error locks only guard update and delete
  overrideLock: false,
};
export const createLock: CreateArgs<Slug> = {
  collection: postsSlug,
  data: {},
  // @ts-expect-error locks only guard update and delete
  overrideLock: false,
};
export const duplicateLock: DuplicateArgs<Slug> = {
  collection: postsSlug,
  id: 1,
  // @ts-expect-error locks only guard update and delete
  overrideLock: false,
};

export const findTransaction: FindArgs<Slug> = {
  collection: postsSlug,
  // @ts-expect-error reads don't open a transaction
  disableTransaction: true,
};
export const findByIDTransaction: FindByIDArgs<Slug> = {
  collection: postsSlug,
  id: 1,
  // @ts-expect-error reads don't open a transaction
  disableTransaction: true,
};
export const countTransaction: CountArgs<Slug> = {
  collection: postsSlug,
  // @ts-expect-error reads don't open a transaction
  disableTransaction: true,
};
export const distinctTransaction: FindDistinctArgs<Slug> = {
  collection: postsSlug,
  field: 'title',
  // @ts-expect-error reads don't open a transaction
  disableTransaction: true,
};

expectTypeOf<CreateArgs<Slug>['duplicateFromID']>().toEqualTypeOf<DocID | undefined>();
expectTypeOf<CreateArgs<Slug>['overwriteExistingFiles']>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<UpdateByIDArgs<Slug>['filePath']>().toEqualTypeOf<string | undefined>();
expectTypeOf<UpdateManyArgs<Slug>['filePath']>().toEqualTypeOf<string | undefined>();
expectTypeOf<UpdateByIDArgs<Slug>['overwriteExistingFiles']>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<UpdateManyArgs<Slug>['overwriteExistingFiles']>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<UpdateByIDArgs<Slug>['publishAllLocales']>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<UpdateManyArgs<Slug>['publishAllLocales']>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<UpdateByIDArgs<Slug>['unpublishAllLocales']>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<UpdateManyArgs<Slug>['unpublishAllLocales']>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<AuthArgs['canSetHeaders']>().toEqualTypeOf<boolean | undefined>();

export const duplicateFromUpdate: UpdateByIDArgs<Slug> = {
  collection: postsSlug,
  data: {},
  // @ts-expect-error only create copies another document
  duplicateFromID: 1,
  id: 1,
};

export const findWithoutJoins: FindArgs<Slug> = { collection: postsSlug, joins: false };
export const findByIDWithoutJoins: FindByIDArgs<Slug> = {
  collection: postsSlug,
  id: 1,
  joins: false,
};
export const findWithJoinQuery: FindArgs<Slug> = {
  collection: postsSlug,
  joins: { related: { count: true, limit: 5, page: 2, sort: '-createdAt' }, other: false },
};
export const countJoins: CountArgs<Slug> = {
  collection: postsSlug,
  // @ts-expect-error only find and findByID return join fields
  joins: false,
};
export const findJoinLimit: FindArgs<Slug> = {
  collection: postsSlug,
  // @ts-expect-error a join limit is a number
  joins: { related: { limit: '5' } },
};
