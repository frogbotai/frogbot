import {
  isPieceAction,
  isPieceInstance,
  pieceActionTool,
  pieceInstanceTools,
} from '../../pieces/definePiece.js';
import type { PieceAction, PieceInstance } from '../../pieces/types.js';
import { isRecord } from '../../utilities/isRecord.js';
import type { AnyTool } from '../types.js';
import { isClientTool } from '../types.js';

export function sanitizeToolList(
  tools: readonly (AnyTool | PieceAction | PieceInstance)[],
  contextLabel: string,
): AnyTool[] {
  const context = `${contextLabel[0].toLowerCase()}${contextLabel.slice(1)}`;
  const toolSlugs = new Set<string>();
  const expanded: AnyTool[] = [];

  for (const configuredTool of tools) {
    if (isPieceInstance(configuredTool)) {
      const instanceTools = pieceInstanceTools(configuredTool);
      if (instanceTools) expanded.push(...instanceTools);
      continue;
    }

    if (isPieceAction(configuredTool)) {
      const actionTool = pieceActionTool(configuredTool);
      if (actionTool) expanded.push(actionTool);
      continue;
    }

    expanded.push(configuredTool);
  }

  return expanded.map((configuredTool) => {
    const tool = configuredTool;
    if (!isRecord(tool) || typeof tool.slug !== 'string' || !tool.slug.trim()) {
      throw new Error(`[frogbot] A tool in ${context} is missing a \`slug\`.`);
    }

    if (toolSlugs.has(tool.slug)) {
      throw new Error(`[frogbot] Duplicate tool slug '${tool.slug}' in ${context}.`);
    }

    if (typeof tool.description !== 'string' || !tool.description.trim()) {
      throw new Error(`[frogbot] Tool '${tool.slug}' in ${context} requires a description.`);
    }

    if (isClientTool(tool)) {
      if (
        !tool.inputSchema ||
        !tool.outputSchema ||
        typeof tool.client.kind !== 'string' ||
        !tool.client.kind.trim()
      ) {
        throw new Error(
          `[frogbot] Client tool '${tool.slug}' in ${context} requires inputSchema, outputSchema, and client.kind.`,
        );
      }

      toolSlugs.add(tool.slug);

      return tool;
    }

    if (!tool.inputSchema || typeof tool.execute !== 'function') {
      throw new Error(
        `[frogbot] Tool '${tool.slug}' in ${context} requires inputSchema and execute.`,
      );
    }

    toolSlugs.add(tool.slug);
    const sanitizedTool: AnyTool = {
      ...tool,
      description: tool.description,
      execute: tool.execute,
      inputSchema: tool.inputSchema,
      slug: tool.slug,
    };

    return sanitizedTool;
  });
}
