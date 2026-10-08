import type { GraphQLExtension, PayloadRequest } from 'payload';
import { describe, expect, it } from 'vitest';

import { wrapGraphQLExtension } from '../../../../packages/frogbot/src/config/wrapGraphQLExtension.js';
import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';

type ResolverField = {
  resolve: (source: unknown, args: unknown, context: unknown, info: unknown) => Promise<unknown>;
};

const graphQL = {} as Parameters<GraphQLExtension>[0];
const schemaContext = {} as Parameters<GraphQLExtension>[1];

function unexpectedAttach(): Promise<FrogBotRequest> {
  return Promise.reject(new Error('Unexpected attachment'));
}

describe('custom GraphQL extension wrapping', () => {
  it('keeps an absent extension absent', () => {
    const wrapped = wrapGraphQLExtension(undefined, unexpectedAttach);

    expect(wrapped).toBeUndefined();
  });

  it.each([null, undefined, false, 7, 'field', () => 'field'])(
    'passes a non-object field through unchanged: %s',
    (field) => {
      const wrapped = wrapGraphQLExtension(() => ({ field }), unexpectedAttach);

      const fields = wrapped!(graphQL, schemaContext);

      expect(fields.field).toBe(field);
    },
  );

  it.each([{}, { type: 'String' }, { resolve: null }, { resolve: 'not a function' }])(
    'preserves field identity when there is no callable resolver: %j',
    (field) => {
      const wrapped = wrapGraphQLExtension(() => ({ field }), unexpectedAttach);

      const fields = wrapped!(graphQL, schemaContext);

      expect(fields.field).toBe(field);
    },
  );

  it('awaits request attachment and preserves resolver arguments, result and field metadata', async () => {
    const instance = { name: 'FrogBot instance' };
    const result = { ok: true };
    const source = { parent: true };
    const args = { text: 'input' };
    const req = { payload: {} } as PayloadRequest;
    const context = { req, custom: 'context' };
    const info = { fieldName: 'customQuery' };
    const calls: unknown[][] = [];
    const field = {
      type: 'String',
      args: { text: { type: 'String' } },
      description: 'Custom description',
      deprecationReason: 'Use another field',
      resolve: (...resolverArgs: unknown[]) => {
        calls.push(resolverArgs);

        expect(req).toHaveProperty('frogbot', instance);

        return result;
      },
    };

    const wrapped = wrapGraphQLExtension(
      (module, buildContext) => {
        expect(module).toBe(graphQL);
        expect(buildContext).toBe(schemaContext);

        return { customQuery: field };
      },
      async (request) => {
        await Promise.resolve();

        return Object.assign(request, { frogbot: instance }) as unknown as FrogBotRequest;
      },
    );

    const fields = wrapped!(graphQL, schemaContext);
    const resolved = await (fields.customQuery as ResolverField).resolve(
      source,
      args,
      context,
      info,
    );

    expect(resolved).toBe(result);
    expect(calls).toEqual([[source, args, context, info]]);
    expect(calls[0]?.[2]).toBe(context);
    expect(fields.customQuery).toMatchObject({ ...field, resolve: expect.any(Function) });
    expect(field.resolve).not.toBe((fields.customQuery as ResolverField).resolve);
  });

  it.each([undefined, {}, { req: {} }])(
    'allows resolver calls without a Payload request: %j',
    async (context) => {
      const wrapped = wrapGraphQLExtension(
        () => ({ field: { resolve: () => 'unchanged' } }),
        unexpectedAttach,
      );

      const fields = wrapped!(graphQL, schemaContext);

      const result = await (fields.field as ResolverField).resolve(null, {}, context, {});

      expect(result).toBe('unchanged');
    },
  );

  it('preserves the original resolver error', async () => {
    const error = new Error('Resolver error');
    const wrapped = wrapGraphQLExtension(
      () => ({
        field: {
          resolve: () => {
            throw error;
          },
        },
      }),
      unexpectedAttach,
    );

    const fields = wrapped!(graphQL, schemaContext);

    const pending = (fields.field as ResolverField).resolve(null, {}, {}, {});

    await expect(pending).rejects.toBe(error);
  });

  it('does not run a resolver when request attachment fails', async () => {
    const error = new Error('Attachment error');
    let resolved = false;
    const wrapped = wrapGraphQLExtension(
      () => ({
        field: {
          resolve: () => {
            resolved = true;
          },
        },
      }),
      () => Promise.reject(error),
    );

    const fields = wrapped!(graphQL, schemaContext);

    const pending = (fields.field as ResolverField).resolve(null, {}, { req: { payload: {} } }, {});

    await expect(pending).rejects.toBe(error);
    expect(resolved).toBe(false);
  });
});
