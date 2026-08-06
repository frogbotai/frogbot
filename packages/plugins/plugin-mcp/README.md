# @frogbotai/plugin-mcp

Expose selected FrogBot collections and globals to external MCP clients through Payload's MCP server.

```ts
import { apiKeysPlugin } from '@frogbotai/plugin-api-keys';
import { mcpPlugin } from '@frogbotai/plugin-mcp';
import { rolesPlugin } from '@frogbotai/plugin-roles';
import { buildConfig } from 'frogbot';

export default buildConfig({
  collections: [
    { slug: 'users', auth: true, fields: [] },
    { slug: 'posts', fields: [{ name: 'title', type: 'text' }] },
  ],
  plugins: [
    rolesPlugin(),
    apiKeysPlugin(),
    mcpPlugin({
      collections: { posts: { enabled: { find: true } } },
    }),
  ],
});
```

Connect MCP clients to `/api/mcp` with a Bearer token minted by `@frogbotai/plugin-api-keys`. Revoked, malformed, and unknown keys are rejected. The plugin requires `apiKeysPlugin()` earlier in the plugin array.

This package is a thin adapter around `@payloadcms/plugin-mcp`. Payload adds a dormant `payload-mcp-api-keys` collection for schema stability, but its keys cannot authenticate this endpoint. Experimental config, collection-definition, job, and auth-mutation tools are unavailable. SSE is not supported.
