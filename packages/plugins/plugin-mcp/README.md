# @frogbotai/plugin-mcp

Expose your app's collections and tools to external MCP clients.

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

Collections with a blocks field also get `listBlocks`, `getBlock`, `insertBlock`, `updateBlock`, `moveBlock` and `removeBlock`, which edit one block at a time by its id, so clients never rewrite a whole blocks array. Edits save as drafts where the collection has drafts.

Serve FrogBot tools, piece actions and piece instances with `tools`, the same list an agent takes. Each runs as the key's owner, with `ctx.agent.slug` set to `'mcp'`:

```ts
mcpPlugin({ tools: [lookupTicket, slack] });
```

A client tool, a duplicate slug, a slug a built-in tool uses, or an input schema MCP can't list (not an object, or not expressible as JSON Schema) is refused when the plugin is created.
