import type { Logger } from '../frogbot.js';
import type { FrogBotRequest } from '../types/request.js';
import type { AnyTool, ToolCtx } from './types.js';

export const NO_TOOL_ACCESS = "Not run: this run's user can't use this tool.";

/** Runs a tool's `access` rule. Unset allows; `false` or a throw denies, and a throw is logged. */
export async function canUseTool({
  tool,
  req,
  agent,
  logger,
}: {
  tool: AnyTool;
  req: FrogBotRequest;
  agent: ToolCtx['agent'];
  logger: Pick<Logger, 'warn'>;
}): Promise<boolean> {
  const { access } = tool;

  if (!access) return true;

  try {
    return Boolean(await access({ req, agent, tool: { slug: tool.slug } }));
  } catch (error) {
    logger.warn(
      { err: error, tool: tool.slug, agent: agent.slug },
      `[frogbot] Tool '${tool.slug}' access threw; the tool is hidden.`,
    );

    return false;
  }
}
