import type {
  Access,
  AccessArgs,
  CollectionAccess,
  CollectionConfig,
  FrogBotRequest,
} from 'frogbot';
import type { AccessArgs as PayloadAccessArgs } from 'payload';
import { expectTypeOf } from 'vitest';

type Data = { title: string };

declare const args: AccessArgs<Data>;

expectTypeOf(args.collectionConfig).toEqualTypeOf<PayloadAccessArgs<Data>['collectionConfig']>();
expectTypeOf(args.data).toEqualTypeOf<Data | undefined>();
expectTypeOf(args.id).toEqualTypeOf<PayloadAccessArgs<Data>['id']>();
expectTypeOf(args.isReadingStaticFile).toEqualTypeOf<boolean | undefined>();
expectTypeOf(args.req).toEqualTypeOf<FrogBotRequest>();

// @ts-expect-error FrogBot requests don't expose req.payload.
void args.req.payload;
// @ts-expect-error Access arguments don't expose payload.
void args.payload;

const read: Access<Data> = ({ req, data }) => {
  expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();
  expectTypeOf(data).toEqualTypeOf<Data | undefined>();

  return true;
};

const access: CollectionAccess = {
  admin: ({ req }) => {
    expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

    // @ts-expect-error FrogBot requests don't expose req.payload.
    void req.payload;

    return false;
  },
  read,
};

const denied: CollectionAccess = { admin: () => false };

const invalid: CollectionAccess = {
  // @ts-expect-error Admin access is function-only (D4 = A).
  admin: false,
};

const collection: CollectionConfig = {
  slug: 'posts',
  fields: [],
  access: {
    read: ({ req, collectionConfig }) => {
      expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();
      expectTypeOf(collectionConfig).toEqualTypeOf<PayloadAccessArgs['collectionConfig']>();

      // @ts-expect-error FrogBot requests don't expose req.payload.
      void req.payload;

      return true;
    },
    // @ts-expect-error Access arguments don't expose payload.
    create: ({ payload }) => Boolean(payload),
    // @ts-expect-error Admin access arguments don't expose payload.
    admin: ({ payload }) => Boolean(payload),
  },
};

expectTypeOf(access).toMatchTypeOf<CollectionAccess>();
expectTypeOf(denied).toMatchTypeOf<CollectionAccess>();
expectTypeOf(invalid).toMatchTypeOf<CollectionAccess>();
expectTypeOf(collection).toMatchTypeOf<CollectionConfig>();
