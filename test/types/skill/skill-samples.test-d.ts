import type { CatalogModelId } from 'frogbot';

declare module 'frogbot' {
  export interface GeneratedTypes {
    models: CatalogModelId | 'zen/big-pickle';
  }
}

import './samples/access-control.js';
import './samples/access-control-advanced.js';
import './samples/adapters.js';
import './samples/advanced.js';
import './samples/agents.js';
import './samples/ai.js';
import './samples/chat-ui.js';
import './samples/collections.js';
import './samples/connections.js';
import './samples/endpoints.js';
import './samples/env.js';
import './samples/field-type-guards.js';
import './samples/fields.js';
import './samples/gateway.js';
import './samples/hooks.js';
import './samples/jobs.js';
import './samples/kv.js';
import './samples/mcp.js';
import './samples/pieces.js';
import './samples/plugin-development.js';
import './samples/plugins-roles-keys.js';
import './samples/queries.js';
import './samples/skill.js';
import './samples/tools.js';
