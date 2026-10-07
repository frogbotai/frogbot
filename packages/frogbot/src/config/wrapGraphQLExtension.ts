import type { GraphQLExtension, PayloadRequest } from 'payload';

import type { FrogBotRequest } from '../types/request.js';

type AttachFrogBot = (req: PayloadRequest) => Promise<FrogBotRequest>;

// eslint-disable-next-line @typescript-eslint/max-params -- GraphQL resolver signature
type GraphQLResolver = (
  source: unknown,
  args: unknown,
  context: { req?: PayloadRequest },
  info: unknown,
) => unknown;

function wrapResolver(resolve: GraphQLResolver, attachFrogBot: AttachFrogBot): GraphQLResolver {
  // eslint-disable-next-line @typescript-eslint/max-params -- GraphQL resolver signature
  return async (source, args, context, info) => {
    if (context?.req?.payload) await attachFrogBot(context.req);

    return resolve(source, args, context, info);
  };
}

function wrapField(field: unknown, attachFrogBot: AttachFrogBot): unknown {
  if (typeof field !== 'object' || field === null) return field;

  const { resolve } = field as { resolve?: unknown };

  if (typeof resolve !== 'function') return field;

  return { ...field, resolve: wrapResolver(resolve as GraphQLResolver, attachFrogBot) };
}

export function wrapGraphQLExtension(
  extension: GraphQLExtension | undefined,
  attachFrogBot: AttachFrogBot,
): GraphQLExtension | undefined {
  if (!extension) return extension;

  return (graphQL, context) => {
    const fields = extension(graphQL, context);

    return Object.fromEntries(
      Object.entries(fields).map(([name, field]) => [name, wrapField(field, attachFrogBot)]),
    );
  };
}
