import type { ToolCtx } from '../tools/types.js';

export type SaveChatAssetProps = {
  ctx: ToolCtx;
  filename: string;
  mimeType: string;
  data: Buffer | Uint8Array;
};

export type ChatAsset = {
  id: string | number;
  filename: string;
  mimeType: string;
  filesize: number;
  url: string;
};

export async function saveChatAsset({
  ctx,
  filename,
  mimeType,
  data,
}: SaveChatAssetProps): Promise<ChatAsset> {
  const chat = ctx.req.frogbot.config.chat;

  if (!chat.enabled || ctx.agent.chatId === undefined) {
    throw new Error('[frogbot] saveChatAsset requires chat persistence and a current chat.');
  }

  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

  const owner = ctx.req.user?.id;

  const doc = await ctx.req.frogbot.create({
    collection: chat.assetsSlug,
    data: { chat: ctx.agent.chatId, ...(owner !== undefined ? { owner } : {}) },
    file: { data: buffer, mimetype: mimeType, name: filename, size: buffer.byteLength },
    depth: 0,
    req: ctx.req,
    overrideAccess: true,
  });

  return doc as unknown as ChatAsset;
}
