import type {
  CountArgs,
  CreateArgs,
  DeleteByIDArgs,
  DeleteManyArgs,
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
