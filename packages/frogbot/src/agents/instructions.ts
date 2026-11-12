import type { FrogBotRequest } from '../types/request.js';
import type { SanitizedAgentConfig } from './types.js';

export async function resolveAgentInstructions(
  config: Pick<SanitizedAgentConfig, 'slug' | 'instructions' | 'skillLines'>,
  req: FrogBotRequest,
): Promise<string> {
  const { slug, instructions, skillLines = [] } = config;
  const text = typeof instructions === 'function' ? await instructions({ req }) : instructions;

  if (typeof text !== 'string') {
    throw new Error(`[frogbot] Agent '${slug}' instructions returned a non-string value.`);
  }

  if (!text.trim()) {
    throw new Error(`[frogbot] Agent '${slug}' instructions returned an empty string.`);
  }

  return skillLines.length === 0 ? text : `${text}\n\n${skillLines.join('\n')}`;
}
