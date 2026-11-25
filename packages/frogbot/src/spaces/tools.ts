import { z } from 'zod';

import type { AnyTool } from '../tools/types.js';
import { runSpace } from './run.js';

export const SPACE_TOOL_SLUGS = ['space_file_read'] as const;

/** Reads a file of the run's Space by name. Core offers it only in a chat whose Space has files. */
export const spaceFileReadTool: AnyTool = {
  slug: 'space_file_read',
  label: 'Space: Read file',
  description:
    'Read a file from this chat’s Space by its name, as listed under the Space section of your instructions.',
  inputSchema: z.object({
    filename: z.string().min(1).describe('The file name, such as `pricing.xlsx`'),
  }),
  execute: async ({ filename }, { req, agent }) => {
    const chat = req.frogbot.config.chat;
    const space = await runSpace({ req, chatId: agent.chatId });

    if (!chat.enabled || !space) return 'This chat has no Space.';

    const { docs } = await req.frogbot.find({
      collection: chat.spaceFilesSlug,
      where: { and: [{ space: { equals: space.id } }, { filename: { equals: filename } }] },
      select: { text: true },
      depth: 0,
      limit: 1,
      pagination: false,
      req,
      overrideAccess: true,
    });

    const text = docs[0]?.text;

    if (typeof text !== 'string') {
      return `No file named "${filename}" in this Space. Files: ${space.files.join(', ') || 'none'}.`;
    }

    return text;
  },
};

/** Refuses an app tool that takes a Space tool's slug. */
export function assertNoSpaceToolSlugs(tools: readonly AnyTool[] | undefined): void {
  for (const tool of tools ?? []) {
    if ((SPACE_TOOL_SLUGS as readonly string[]).includes(tool.slug)) {
      throw new Error(`[frogbot] Tool slug '${tool.slug}' is reserved for Spaces.`);
    }
  }
}
