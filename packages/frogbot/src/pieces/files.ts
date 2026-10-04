import type { FrogBotRequest } from '../types/request.js';

export function filesCollectionSlug(req: FrogBotRequest, piece: string): string {
  const slug = req.frogbot.config?.files?.slug;

  if (!slug) {
    throw new Error(
      `[frogbot] ${piece} requires a files collection. Add an upload collection with \`file: true\`.`,
    );
  }

  return slug;
}
