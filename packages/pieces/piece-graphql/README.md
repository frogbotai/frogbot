# `@frogbotai/piece-graphql`

Send GraphQL queries and mutations to HTTP endpoints, with optional proxy and failsafe handling.

## Usage

```ts
import { createGraphql } from '@frogbotai/piece-graphql';

export const graphql = createGraphql();
```

## Actions

| Upstream action slug | Previous wrapper export | Native action | Notes                                                                                                                                                                                  |
| -------------------- | ----------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `send_request`       | `sendRequest`           | `sendRequest` | GET and HEAD encode the operation in the URL. `use_proxy` and `proxy_settings` become `useProxy` and `proxySettings`; nested fields become `host`, `port`, `username`, and `password`. |

The upstream piece registers no triggers.
