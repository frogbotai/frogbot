import type {
  BulkResult,
  CreateArgs,
  DeleteByIDArgs,
  DeleteManyArgs,
  DuplicateArgs,
  FindArgs,
  FindByIDArgs,
  FindVersionByIDArgs,
  FindVersionsArgs,
  FrogBotInstance,
  FrogBotTypes,
  PaginatedDocs,
  RestoreVersionArgs,
  SelectType,
  TypeWithVersion,
  UpdateByIDArgs,
  UpdateManyArgs,
} from 'frogbot';
import { expectTypeOf } from 'vitest';

import type { Config, SelectPost } from '../../select/frogbot-types.js';
import { postsSlug } from '../../select/shared.js';

type Slug = typeof postsSlug;

declare const frogbot: FrogBotInstance;

expectTypeOf<FrogBotTypes['collections']>().toEqualTypeOf<Config['collections']>();
expectTypeOf<SelectPost['title']>().toEqualTypeOf<string>();
expectTypeOf<SelectPost['owner']>().not.toBeAny();

const include = {
  title: true,
  details: { summary: true },
} satisfies SelectType;

const exclude = {
  body: false,
  details: { budget: false },
} satisfies SelectType;

expectTypeOf<FindArgs<Slug>>().toMatchTypeOf<{ select?: SelectType }>();
expectTypeOf<FindByIDArgs<Slug>>().toMatchTypeOf<{ select?: SelectType }>();
expectTypeOf<CreateArgs<Slug>>().toMatchTypeOf<{ select?: SelectType }>();
expectTypeOf<UpdateByIDArgs<Slug>>().toMatchTypeOf<{ select?: SelectType }>();
expectTypeOf<UpdateManyArgs<Slug>>().toMatchTypeOf<{ select?: SelectType }>();
expectTypeOf<DeleteByIDArgs<Slug>>().toMatchTypeOf<{ select?: SelectType }>();
expectTypeOf<DeleteManyArgs<Slug>>().toMatchTypeOf<{ select?: SelectType }>();
expectTypeOf<DuplicateArgs<Slug>>().toMatchTypeOf<{ select?: SelectType }>();
expectTypeOf<FindVersionsArgs<Slug>>().toMatchTypeOf<{ select?: SelectType }>();
expectTypeOf<FindVersionByIDArgs<Slug>>().toMatchTypeOf<{ select?: SelectType }>();
expectTypeOf<RestoreVersionArgs<Slug>>().toMatchTypeOf<{ select?: never }>();

const find: FindArgs<Slug> = { collection: postsSlug, select: include };
const create: CreateArgs<Slug> = { collection: postsSlug, data: {}, select: exclude };
const restore = { collection: postsSlug, id: 1 } satisfies RestoreVersionArgs<Slug>;

const projectedRestore = { ...restore, select: include };
const excludedRestore = { ...restore, select: exclude };

expectTypeOf(restore).toMatchTypeOf<RestoreVersionArgs<Slug>>();
expectTypeOf(projectedRestore).not.toMatchTypeOf<RestoreVersionArgs<Slug>>();
expectTypeOf(excludedRestore).not.toMatchTypeOf<RestoreVersionArgs<Slug>>();

expectTypeOf(find.select).toEqualTypeOf<SelectType | undefined>();
expectTypeOf(create.select).toEqualTypeOf<SelectType | undefined>();

for (const select of [include, exclude]) {
  const found = frogbot.find({ collection: postsSlug, select });

  const foundByID = frogbot.findByID({ collection: postsSlug, id: 1, select });

  const created = frogbot.create({
    collection: postsSlug,
    data: { title: 'Created', owner: 1 },
    select,
  });

  const updated = frogbot.update({
    collection: postsSlug,
    id: 1,
    data: { title: 'Updated' },
    select,
  });

  const updatedMany = frogbot.update({
    collection: postsSlug,
    where: { owner: { equals: 1 } },
    data: { title: 'Updated' },
    select,
  });

  const deleted = frogbot.delete({ collection: postsSlug, id: 1, select });

  const deletedMany = frogbot.delete({
    collection: postsSlug,
    where: { owner: { equals: 1 } },
    select,
  });

  const duplicated = frogbot.duplicate({ collection: postsSlug, id: 1, select });

  expectTypeOf(found).toEqualTypeOf<Promise<PaginatedDocs<SelectPost>>>();
  expectTypeOf(foundByID).toEqualTypeOf<Promise<SelectPost>>();
  expectTypeOf(created).toEqualTypeOf<Promise<SelectPost>>();
  expectTypeOf(updated).toEqualTypeOf<Promise<SelectPost>>();
  expectTypeOf(updatedMany).toEqualTypeOf<Promise<BulkResult<SelectPost>>>();
  expectTypeOf(deleted).toEqualTypeOf<Promise<SelectPost>>();
  expectTypeOf(deletedMany).toEqualTypeOf<Promise<BulkResult<SelectPost>>>();
  expectTypeOf(duplicated).toEqualTypeOf<Promise<SelectPost>>();
}

const versionSelections = [
  { version: include } satisfies SelectType,
  { version: exclude } satisfies SelectType,
];

for (const select of versionSelections) {
  const versions = frogbot.findVersions({ collection: postsSlug, select });

  const version = frogbot.findVersionByID({ collection: postsSlug, id: 1, select });

  expectTypeOf(versions).toEqualTypeOf<Promise<PaginatedDocs<TypeWithVersion<SelectPost>>>>();
  expectTypeOf(version).toEqualTypeOf<Promise<TypeWithVersion<SelectPost>>>();
}

expectTypeOf(frogbot.restoreVersion(restore)).toEqualTypeOf<Promise<SelectPost>>();

expectTypeOf<{ title: 'yes' }>().not.toMatchTypeOf<SelectType>();
expectTypeOf<{ title: true; body: false }>().not.toMatchTypeOf<SelectType>();
expectTypeOf<{ details: { owner: true; budget: false } }>().not.toMatchTypeOf<SelectType>();
expectTypeOf<{ details: { owner: 1 } }>().not.toMatchTypeOf<SelectType>();
