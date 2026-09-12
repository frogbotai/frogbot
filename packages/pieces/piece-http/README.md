# `@frogbotai/piece-http`

Send HTTP requests and parse absolute URLs without a configured credential.

## Usage

```ts
import { createHttp } from '@frogbotai/piece-http';

export const http = createHttp();
```

## Actions

| Upstream action slug | Previous wrapper export | Native action | Notes                                                            |
| -------------------- | ----------------------- | ------------- | ---------------------------------------------------------------- |
| `send_request`       | `sendRequest`           | `sendRequest` | Uses raw `fetch`; proxy and workflow retry controls are omitted. |
| `parse_url`          | `parseUrl`              | `parseUrl`    | Output keys use native camelCase.                                |
