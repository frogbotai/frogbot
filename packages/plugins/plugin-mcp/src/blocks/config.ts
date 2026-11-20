import type { MCPPluginConfig } from '@payloadcms/plugin-mcp';
import type { CollectionConfig, Field } from 'frogbot';

import type { McpCollectionOptions } from '../index.js';
import { BLOCK_TOOLS, type BlockToolName, blockTools } from './tools.js';

type PayloadCollections = NonNullable<MCPPluginConfig['collections']>;

/**
 * Adds the block tools to each collection with a blocks field. A collection keeps a block tool out
 * with `false`, and loses the reading ones with `find: false` and the writing ones with
 * `update: false`.
 */
export function withBlockTools(
  appCollections: readonly CollectionConfig[],
  collections: Record<string, McpCollectionOptions> = {},
): PayloadCollections {
  const result: PayloadCollections = { ...collections };

  for (const collection of appCollections) {
    if (!hasBlocks(collection.fields)) continue;

    const options = collections[collection.slug] ?? {};
    const tools: Record<string, unknown> = { ...options.tools };

    for (const name of Object.keys(BLOCK_TOOLS) as BlockToolName[]) {
      const base = BLOCK_TOOLS[name].writes ? 'update' : 'find';

      if (tools[name] === false || tools[base] === false) continue;

      tools[name] = blockTools[name];
    }

    result[collection.slug] = { ...options, tools } as PayloadCollections[string];
  }

  return result;
}

function hasBlocks(fields: Field[]): boolean {
  return fields.some((field) => {
    if (field.type === 'blocks') return true;

    if (field.type === 'tabs') return field.tabs.some((tab) => hasBlocks(tab.fields));

    return 'fields' in field && Array.isArray(field.fields) && hasBlocks(field.fields);
  });
}
