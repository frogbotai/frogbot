# @frogbotai/graphql

GraphQL helper types and the `frogbot-graphql` schema generator for [FrogBot](https://github.com/frogbotai/frogbot).

The GraphQL API itself is served by two route files from `@frogbotai/next/routes`. See [Enable GraphQL](https://docs.frogbot.ai/graphql/enable).

## Installation

```bash
pnpm add @frogbotai/graphql -D
```

## Generate the schema

```bash
pnpm frogbot-graphql generate:schema
```

The command finds your FrogBot config the same way `frogbot generate:types` does (set `FROGBOT_CONFIG_PATH` to override) and writes `graphQL.schemaOutputFile`, which defaults to `schema.graphql` in the current directory.

## Custom queries

```ts
import { GraphQLJSON } from '@frogbotai/graphql/types';
import type { FrogBotConfig } from 'frogbot';

export const graphQL: FrogBotConfig['graphQL'] = {
  queries: () => ({
    serverInfo: {
      type: GraphQLJSON,
      resolve: () => ({ startedAt: new Date().toISOString() }),
    },
  }),
};
```

Pass `graphQL` to `buildConfig` in your FrogBot config. See [Custom Queries and Mutations](https://docs.frogbot.ai/graphql/extending).

## Entry points

| Entry                          | Exports                                                                 |
| ------------------------------ | ----------------------------------------------------------------------- |
| `@frogbotai/graphql`           | `configToSchema(config)`: builds the schema from your FrogBot config    |
| `@frogbotai/graphql/types`     | `GraphQL`, `GraphQLJSON`, `GraphQLJSONObject`, `buildPaginatedListType` |
| `@frogbotai/graphql/utilities` | `generateSchema(config)`: writes the schema file and returns its path   |
