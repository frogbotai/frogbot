import type {
  AccessArgs,
  CollectionAccess,
  CollectionAfterOperationHook,
  CollectionBeforeOperationHook,
  CollectionHooks,
  Endpoint,
  FrogBotRequest,
} from 'frogbot';
import type {
  AccessArgs as PayloadAccessArgs,
  CollectionAfterOperationHook as PayloadCollectionAfterOperationHook,
  CollectionBeforeOperationHook as PayloadCollectionBeforeOperationHook,
  CollectionConfig as PayloadCollectionConfig,
  Endpoint as PayloadEndpoint,
} from 'payload';
import { expectTypeOf } from 'vitest';

type PayloadHooks = NonNullable<PayloadCollectionConfig['hooks']>;

type HookArgs<T> = T extends ((args: infer A) => unknown)[] ? A : never;

type FlatPhase = Exclude<
  keyof CollectionHooks,
  'beforeOperation' | 'afterOperation' | 'me' | 'refresh'
>;

expectTypeOf<keyof CollectionHooks>().toEqualTypeOf<keyof PayloadHooks>();

expectTypeOf<{
  [K in keyof CollectionHooks]: Extract<keyof HookArgs<NonNullable<CollectionHooks[K]>>, 'payload'>;
}>().toEqualTypeOf<{
  [K in keyof CollectionHooks]: never;
}>();

expectTypeOf<{
  [K in FlatPhase]: keyof HookArgs<NonNullable<CollectionHooks[K]>>;
}>().toEqualTypeOf<{
  [K in FlatPhase]: keyof HookArgs<NonNullable<PayloadHooks[K]>>;
}>();

expectTypeOf<{
  [K in FlatPhase]: Omit<HookArgs<NonNullable<CollectionHooks[K]>>, 'req'>;
}>().toEqualTypeOf<{
  [K in FlatPhase]: Omit<HookArgs<NonNullable<PayloadHooks[K]>>, 'req'>;
}>();

expectTypeOf<{
  [K in Exclude<FlatPhase, 'afterForgotPassword'>]: HookArgs<
    NonNullable<CollectionHooks[K]>
  >['req'];
}>().toEqualTypeOf<{
  [K in Exclude<FlatPhase, 'afterForgotPassword'>]: FrogBotRequest;
}>();

type StripReq<T> = T extends unknown ? Omit<T, 'req'> : never;

type NestedParity<T> = T extends { args: infer A }
  ? {
      keys: keyof T;
      outer: Omit<T, 'req' | 'args'>;
      innerKeys: keyof A;
      inner: StripReq<A>;
    }
  : never;

type OperationParity<T extends { operation: string }> = {
  [K in T['operation']]: NestedParity<Extract<T, { operation: K }>>;
};

expectTypeOf<
  OperationParity<Parameters<CollectionBeforeOperationHook<'posts'>>[0]>
>().toEqualTypeOf<OperationParity<Parameters<PayloadCollectionBeforeOperationHook<'posts'>>[0]>>();

expectTypeOf<OperationParity<Parameters<CollectionAfterOperationHook<'posts'>>[0]>>().toEqualTypeOf<
  OperationParity<Parameters<PayloadCollectionAfterOperationHook<'posts'>>[0]>
>();

expectTypeOf<{
  [K in 'me' | 'refresh']: NestedParity<HookArgs<NonNullable<CollectionHooks[K]>>>;
}>().toEqualTypeOf<{
  [K in 'me' | 'refresh']: NestedParity<HookArgs<NonNullable<PayloadHooks[K]>>>;
}>();

expectTypeOf<
  StripReq<Exclude<Awaited<ReturnType<CollectionBeforeOperationHook>>, void>>
>().toEqualTypeOf<
  StripReq<Exclude<Awaited<ReturnType<PayloadCollectionBeforeOperationHook>>, void>>
>();

expectTypeOf<ReturnType<CollectionAfterOperationHook>>().toEqualTypeOf<
  ReturnType<PayloadCollectionAfterOperationHook>
>();

expectTypeOf<keyof AccessArgs>().toEqualTypeOf<keyof PayloadAccessArgs>();
expectTypeOf<Omit<AccessArgs, 'req'>>().toEqualTypeOf<Omit<PayloadAccessArgs, 'req'>>();

expectTypeOf<keyof CollectionAccess>().toEqualTypeOf<
  keyof NonNullable<PayloadCollectionConfig['access']>
>();

expectTypeOf<Omit<Endpoint, 'handler'>>().toEqualTypeOf<Omit<PayloadEndpoint, 'handler'>>();
