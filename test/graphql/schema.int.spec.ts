import { configToSchema } from '@frogbotai/graphql';
import { GraphQL } from '@frogbotai/graphql/types';
import { beforeAll, describe, expect, it } from 'vitest';

import config from './config.js';
import { hiddenTypeNames } from './shared.js';

describe('GraphQL schema from a FrogBot config', () => {
  let schema: GraphQL.GraphQLSchema;
  let sdl: string;

  beforeAll(async () => {
    ({ schema } = await configToSchema(config));

    sdl = GraphQL.printSchema(schema);
  });

  it('includes user and public built-in collections as queries', () => {
    const queries = Object.keys(schema.getQueryType()!.getFields());

    expect(queries).toEqual(
      expect.arrayContaining(['Posts', 'Users', 'Chats', 'Messages', 'Files', 'searchPosts']),
    );
  });

  it.each(hiddenTypeNames)('omits the %s type', (typeName) => {
    expect(sdl).not.toMatch(new RegExp(`\\b${typeName}`));
  });
});
