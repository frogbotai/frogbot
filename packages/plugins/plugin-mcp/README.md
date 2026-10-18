# @frogbotai/plugin-mcp

Expose your app's collections to external MCP clients.

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
  plugins: [rolesPlugin(), apiKeysPlugin(), mcpPlugin()],
});
```

Connect MCP clients to `/api/mcp` with a Bearer token minted by `@frogbotai/plugin-api-keys`. Revoked, malformed, and unknown keys are rejected. The plugin requires `apiKeysPlugin()` earlier in the plugin array.

Every app collection is exposed, and each call runs as the key's owner under the collection's access control. FrogBot's own collections (chats, API keys, logs) are never exposed. SSE is not supported.
