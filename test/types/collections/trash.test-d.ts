import type {
  CountArgs,
  CountVersionsArgs,
  CreateArgs,
  DeleteByIDArgs,
  DeleteManyArgs,
  DuplicateArgs,
  FindArgs,
  FindByIDArgs,
  FindDistinctArgs,
  FindVersionByIDArgs,
  FindVersionsArgs,
  RestoreVersionArgs,
  UpdateByIDArgs,
  UpdateManyArgs,
} from 'frogbot';
import { expectTypeOf } from 'vitest';

import { postsSlug } from '../../select/shared.js';

type Slug = typeof postsSlug;

expectTypeOf<FindArgs<Slug>['trash']>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<FindByIDArgs<Slug>['trash']>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<CountArgs<Slug>['trash']>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<FindDistinctArgs<Slug>['trash']>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<UpdateByIDArgs<Slug>['trash']>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<UpdateManyArgs<Slug>['trash']>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<DeleteByIDArgs<Slug>['trash']>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<DeleteManyArgs<Slug>['trash']>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<FindVersionsArgs<Slug>['trash']>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<FindVersionByIDArgs<Slug>['trash']>().toEqualTypeOf<boolean | undefined>();

export const findTrashed: FindArgs<Slug> = {
  collection: postsSlug,
  trash: true,
  where: { deletedAt: { exists: true } },
};
export const findByIDTrashed: FindByIDArgs<Slug> = { collection: postsSlug, id: 1, trash: true };
export const countTrashed: CountArgs<Slug> = { collection: postsSlug, trash: true };
export const updateTrashed: UpdateByIDArgs<Slug> = {
  collection: postsSlug,
  data: {},
  id: 1,
  trash: true,
};
export const purgeTrashed: DeleteByIDArgs<Slug> = { collection: postsSlug, id: 1, trash: true };
export const purgeAllTrashed: DeleteManyArgs<Slug> = {
  collection: postsSlug,
  trash: true,
  where: { deletedAt: { exists: true } },
};

export const createTrash: CreateArgs<Slug> = {
  collection: postsSlug,
  data: {},
  // @ts-expect-error a new document is never trashed
  trash: true,
};
export const duplicateTrash: DuplicateArgs<Slug> = {
  collection: postsSlug,
  id: 1,
  // @ts-expect-error Payload's duplicate takes no trash option
  trash: true,
};
export const countVersionsTrash: CountVersionsArgs<Slug> = {
  collection: postsSlug,
  // @ts-expect-error Payload's countVersions takes no trash option
  trash: true,
};
export const restoreVersionTrash: RestoreVersionArgs<Slug> = {
  collection: postsSlug,
  id: 1,
  // @ts-expect-error Payload's restoreVersion takes no trash option
  trash: true,
};
