# `@frogbotai/piece-exa`

Search the web, retrieve page content, find similar pages, and generate grounded answers with Exa.

## Usage

```ts
import { createExa } from '@frogbotai/piece-exa';

export const exa = createExa({ auth: { apiKey: process.env.EXA_API_KEY! } });
```

## Actions

| Upstream action slug | Previous wrapper export | Native action      | Notes                                                                                                                                    |
| -------------------- | ----------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `perform_search`     | `performSearch`         | `search`           |                                                                                                                                          |
| `get_contents`       | `getContents`           | `getContents`      |                                                                                                                                          |
| `generate_answer`    | `generateAnswer`        | `generateAnswer`   |                                                                                                                                          |
| `find_similar_links` | `findSimilarLinks`      | `findSimilarPages` | Uses Exa's `/findSimilar` page-search operation.                                                                                         |
| `custom_api_call`    | Not exposed             | Unsupported        | Deliberately excluded because the upstream action has a request-handling bug; use a dedicated HTTP action for unsupported Exa endpoints. |
