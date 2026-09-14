# `@frogbotai/piece-brave-search`

Search the web and call Brave Search API endpoints.

## Usage

```ts
import { createBraveSearch } from '@frogbotai/piece-brave-search';

export const braveSearch = createBraveSearch({
  auth: { apiKey: process.env.BRAVE_SEARCH_API_KEY! },
});
```

## Actions

| Upstream action slug | Previous wrapper export | Native action   | Notes                                      |
| -------------------- | ----------------------- | --------------- | ------------------------------------------ |
| `web_search`         | `web_search`            | `searchWeb`     | Renamed to semantic verb-resource form.    |
| `custom_api_call`    | Not exposed             | `customApiCall` | Restricted to Brave's `/res/v1` API paths. |
