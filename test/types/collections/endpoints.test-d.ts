import type { CollectionConfig, Endpoint, FrogBotConfig, FrogBotRequest, Handler } from 'frogbot';
import { expectTypeOf } from 'vitest';

const endpoint: Endpoint = {
  method: 'get',
  path: '/status',
  handler: (req) => {
    expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

    // @ts-expect-error FrogBot requests don't expose req.payload.
    void req.payload;

    return new Response('ok');
  },
};

const asyncHandler: Handler = async (req) => {
  expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

  return new Response('ok');
};

// @ts-expect-error Endpoint handlers must return a Response, not a string.
const invalidHandler: Handler = () => 'ok';

// @ts-expect-error Async endpoint handlers must resolve to a Response, not a string.
const invalidAsyncHandler: Handler = async () => 'ok';

// @ts-expect-error FrogBot requests don't expose payload.
const payloadHandler: Handler = ({ payload }) => new Response(String(payload));

expectTypeOf([endpoint]).toMatchTypeOf<CollectionConfig['endpoints']>();
expectTypeOf([endpoint]).toMatchTypeOf<FrogBotConfig['endpoints']>();
expectTypeOf<ReturnType<Handler>>().toEqualTypeOf<Response | Promise<Response>>();
expectTypeOf(asyncHandler).toMatchTypeOf<Handler>();
expectTypeOf(invalidHandler).toMatchTypeOf<Handler>();
expectTypeOf(invalidAsyncHandler).toMatchTypeOf<Handler>();
expectTypeOf(payloadHandler).toMatchTypeOf<Handler>();
