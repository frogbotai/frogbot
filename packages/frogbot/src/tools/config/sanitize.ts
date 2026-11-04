import { isMCPServer } from '../../mcp/server.js';
import type { MCPServer } from '../../mcp/types.js';
import {
  isPieceAction,
  isPieceInstance,
  pieceActionTool,
  pieceInstanceTools,
} from '../../pieces/definePiece.js';
import type { PieceAction, PieceInstance } from '../../pieces/types.js';
import { isRecord } from '../../utilities/isRecord.js';
import { assertToolApproval } from '../approval.js';
import type { AnyTool } from '../types.js';
import { isClientTool } from '../types.js';

export function sanitizeToolList(
  tools: readonly (AnyTool | PieceAction | PieceInstance | MCPServer)[],
  contextLabel: string,
): AnyTool[] {
  const context = `${contextLabel[0].toLowerCase()}${contextLabel.slice(1)}`;
  const toolSlugs = new Set<string>();
  const expanded: { tool: AnyTool; fromPiece: boolean }[] = [];

  for (const configuredTool of tools) {
    if (isMCPServer(configuredTool)) continue;

    if (isPieceInstance(configuredTool)) {
      const instanceTools = pieceInstanceTools(configuredTool) ?? [];

      expanded.push(...instanceTools.map((tool) => ({ tool, fromPiece: true })));
      continue;
    }

    if (isPieceAction(configuredTool)) {
      const actionTool = pieceActionTool(configuredTool);

      if (actionTool) expanded.push({ tool: actionTool, fromPiece: true });
      continue;
    }

    expanded.push({ tool: configuredTool, fromPiece: false });
  }

  const explicitSlugs = new Set(
    expanded.flatMap(({ tool, fromPiece }) =>
      fromPiece ? [] : [(tool as { slug?: unknown }).slug],
    ),
  );

  const kept = expanded.filter(
    ({ tool, fromPiece }) => !fromPiece || !explicitSlugs.has(tool.slug),
  );

  return kept.map(({ tool }) => {
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
      if ((tool as { approval?: unknown }).approval !== undefined) {
        throw new Error(
          `[frogbot] Client tool '${tool.slug}' in ${context} can't take \`approval\`: a person already answers it.`,
        );
      }

      if ((tool as { access?: unknown }).access !== undefined) {
        throw new Error(
          `[frogbot] Client tool '${tool.slug}' in ${context} can't take \`access\`; use \`client.access\`.`,
        );
      }

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

    assertToolApproval(tool.approval, `Tool '${tool.slug}' in ${context}`);

    if (tool.access !== undefined && typeof tool.access !== 'function') {
      throw new Error(
        `[frogbot] Tool '${tool.slug}' in ${context}: \`access\` must be a function.`,
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
