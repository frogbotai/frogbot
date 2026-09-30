import type {
  CollectionAfterChangeHook,
  CollectionAfterForgotPasswordHook,
  CollectionBeforeOperationHook,
  CollectionConfig,
  CollectionMeHook,
  CollectionRefreshHook,
  FrogBot,
  FrogBotRequest,
} from 'frogbot';
import type { CollectionSlug as PayloadCollectionSlug } from 'payload';
import { expectTypeOf } from 'vitest';

interface Post {
  id: string;
  title: string;
}

expectTypeOf<PayloadCollectionSlug>().toEqualTypeOf<string>();

const afterChange: CollectionAfterChangeHook<Post> = ({ context, doc, previousDoc, req }) => {
  expectTypeOf(context.channel?.piece).toEqualTypeOf<string | undefined>();
  expectTypeOf(context.channel?.threadId).toEqualTypeOf<string | undefined>();
  expectTypeOf(context.channel?.author.id).toEqualTypeOf<string | undefined>();
  expectTypeOf(doc).toEqualTypeOf<Post>();
  expectTypeOf(previousDoc).toEqualTypeOf<Post>();
  expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

  return doc;
};

const afterForgotPassword: CollectionAfterForgotPasswordHook = (args) => {
  expectTypeOf(args).not.toHaveProperty('req');

  // @ts-expect-error After-forgot-password hook arguments don't expose req.
  void args.req;
  // @ts-expect-error After-forgot-password hook arguments don't expose payload.
  void args.payload;
};

const beforeOperation: CollectionBeforeOperationHook<'posts'> = ({ args, operation }) => {
  if (operation === 'create') {
    expectTypeOf(args.data).toBeObject();
    expectTypeOf(args.req).toEqualTypeOf<FrogBotRequest>();
  }

  if (operation === 'find') {
    expectTypeOf(args.req).toEqualTypeOf<FrogBotRequest | undefined>();
  }

  return args;
};

const collection: CollectionConfig = {
  slug: 'posts',
  fields: [],
  hooks: {
    afterChange: [
      ({ req, doc }) => {
        expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

        // @ts-expect-error FrogBot requests don't expose req.payload.
        void req.payload;

        return doc;
      },
      // @ts-expect-error Collection hook arguments don't expose payload.
      ({ payload }) => payload,
    ],
    afterDelete: [
      ({ req }) => {
        expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

        // @ts-expect-error FrogBot requests don't expose req.payload.
        void req.payload;
      },
    ],
    afterError: [
      ({ req }) => {
        expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

        // @ts-expect-error FrogBot requests don't expose req.payload.
        void req.payload;
      },
    ],
    afterForgotPassword: [afterForgotPassword],
    afterLogin: [
      ({ req }) => {
        expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

        // @ts-expect-error FrogBot requests don't expose req.payload.
        void req.payload;
      },
    ],
    afterLogout: [
      ({ req }) => {
        expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

        // @ts-expect-error FrogBot requests don't expose req.payload.
        void req.payload;
      },
    ],
    afterMe: [
      ({ req }) => {
        expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

        // @ts-expect-error FrogBot requests don't expose req.payload.
        void req.payload;
      },
    ],
    afterOperation: [
      ({ args, operation, req, result }) => {
        expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();
        expectTypeOf(args.req?.frogbot).toEqualTypeOf<FrogBot | undefined>();

        // @ts-expect-error FrogBot requests don't expose req.payload.
        void req.payload;
        // @ts-expect-error Nested FrogBot requests don't expose payload.
        void args.req?.payload;

        if (operation === 'find') {
          expectTypeOf(result.totalDocs).toEqualTypeOf<number>();
        }

        return result;
      },
    ],
    afterRead: [
      ({ req, doc }) => {
        expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

        // @ts-expect-error FrogBot requests don't expose req.payload.
        void req.payload;

        return doc;
      },
    ],
    afterRefresh: [
      ({ req }) => {
        expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

        // @ts-expect-error FrogBot requests don't expose req.payload.
        void req.payload;
      },
    ],
    beforeChange: [
      ({ req, data }) => {
        expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

        // @ts-expect-error FrogBot requests don't expose req.payload.
        void req.payload;

        return data;
      },
    ],
    beforeDelete: [
      ({ req }) => {
        expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

        // @ts-expect-error FrogBot requests don't expose req.payload.
        void req.payload;
      },
    ],
    beforeLogin: [
      ({ req }) => {
        expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

        // @ts-expect-error FrogBot requests don't expose req.payload.
        void req.payload;
      },
    ],
    beforeOperation: [
      ({ args, operation, req }) => {
        expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();
        expectTypeOf(args.req?.frogbot).toEqualTypeOf<FrogBot | undefined>();

        // @ts-expect-error FrogBot requests don't expose req.payload.
        void req.payload;
        // @ts-expect-error Nested FrogBot requests don't expose payload.
        void args.req?.payload;

        if (operation === 'create') {
          expectTypeOf(args.data).toBeObject();
        }

        return args;
      },
    ],
    beforeRead: [
      ({ req, doc }) => {
        expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

        // @ts-expect-error FrogBot requests don't expose req.payload.
        void req.payload;

        return doc;
      },
    ],
    beforeValidate: [
      ({ req, data }) => {
        expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

        // @ts-expect-error FrogBot requests don't expose req.payload.
        void req.payload;

        return data;
      },
    ],
    me: [
      ({ args, user }) => {
        expectTypeOf(args.req).toEqualTypeOf<FrogBotRequest>();
        expectTypeOf(args.req.frogbot).toEqualTypeOf<FrogBot>();

        // @ts-expect-error Nested FrogBot requests don't expose payload.
        void args.req.payload;

        void user;
      },
      // @ts-expect-error Me hook requests are nested under args, not exposed as req.
      ({ req, user }) => void [req, user],
    ],
    refresh: [
      ({ args, user }) => {
        expectTypeOf(args.req).toEqualTypeOf<FrogBotRequest>();
        expectTypeOf(args.req.frogbot).toEqualTypeOf<FrogBot>();

        // @ts-expect-error Nested FrogBot requests don't expose payload.
        void args.req.payload;

        void user;
      },
      // @ts-expect-error Refresh hook requests are nested under args, not exposed as req.
      ({ req, user }) => void [req, user],
    ],
  },
};

declare const meArgs: Parameters<CollectionMeHook<Post>>[0];
declare const refreshArgs: Parameters<CollectionRefreshHook<Post>>[0];

expectTypeOf(meArgs.user).toEqualTypeOf<Post>();
expectTypeOf(refreshArgs.user).toEqualTypeOf<Post>();
expectTypeOf(meArgs).not.toHaveProperty('req');
expectTypeOf(refreshArgs).not.toHaveProperty('req');
expectTypeOf(meArgs).not.toHaveProperty('payload');
expectTypeOf(refreshArgs).not.toHaveProperty('payload');
expectTypeOf(collection).toMatchTypeOf<CollectionConfig>();
expectTypeOf(afterChange).toMatchTypeOf<CollectionAfterChangeHook<Post>>();
expectTypeOf(beforeOperation).toMatchTypeOf<CollectionBeforeOperationHook<'posts'>>();
