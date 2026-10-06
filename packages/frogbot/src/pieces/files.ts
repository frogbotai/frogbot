import type { DocID } from '../collections/config/types.js';
import type { TypeWithID } from '../types/generated.js';
import type { FrogBotRequest } from '../types/request.js';

/** A document in the files collection. Its shape is the same whatever collections the app declares. */
export type PieceFile = TypeWithID & Record<string, unknown>;

type PieceFileArgs = {
  overrideAccess: boolean;
  req?: FrogBotRequest;
};

export function filesCollectionSlug(req: FrogBotRequest, piece: string): string {
  const slug = req.frogbot.config?.files?.slug;

  if (!slug) {
    throw new Error(
      `[frogbot] ${piece} requires a files collection. Add an upload collection with \`file: true\`.`,
    );
  }

  return slug;
}

export function findPieceFile(
  req: FrogBotRequest,
  piece: string,
  args: PieceFileArgs & { id: DocID; depth?: number },
): Promise<PieceFile> {
  return req.frogbot.findByID({ ...args, collection: filesCollectionSlug(req, piece) });
}

export function createPieceFile(
  req: FrogBotRequest,
  piece: string,
  args: PieceFileArgs & { file: { data: Buffer; mimetype: string; name: string; size: number } },
): Promise<PieceFile> {
  return req.frogbot.create({ ...args, collection: filesCollectionSlug(req, piece), data: {} });
}
