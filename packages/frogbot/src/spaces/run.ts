import type { DocID } from '../collections/config/types.js';
import type { FrogBotRequest } from '../types/request.js';
import { canAccessSpace } from './access.js';

/** The Space a chat belongs to, as one agent run sees it. */
export type RunSpace = {
  id: DocID;
  title: string;
  instructions: string;
  files: string[];
};

/** How many file names the prompt lists. The agent reads any of them by name. */
export const SPACE_FILE_LIST_LIMIT = 100;

const chats = new WeakMap<
  FrogBotRequest,
  Map<DocID, Promise<Record<string, unknown> | undefined>>
>();

const spaces = new WeakMap<FrogBotRequest, Map<DocID, Promise<RunSpace | undefined>>>();

function cached<T>(
  store: WeakMap<FrogBotRequest, Map<DocID, Promise<T>>>,
  req: FrogBotRequest,
  key: DocID,
  load: () => Promise<T>,
): Promise<T> {
  let byKey = store.get(req);

  if (!byKey) {
    byKey = new Map();
    store.set(req, byKey);
  }

  let value = byKey.get(key);

  if (!value) {
    value = load();
    byKey.set(key, value);
    value.catch(() => byKey.delete(key));
  }

  return value;
}

export function spaceIDOf(value: unknown): DocID | undefined {
  if (typeof value === 'string' || typeof value === 'number') return value;

  if (value && typeof value === 'object' && 'id' in value) return spaceIDOf(value.id);

  return undefined;
}

/** The run's chat, read once per request with access skipped, as the turn already checked it. */
export function runChat({
  req,
  chatId,
}: {
  req: FrogBotRequest;
  chatId: DocID | undefined;
}): Promise<Record<string, unknown> | undefined> {
  const chat = req.frogbot.config.chat;

  if (chatId === undefined || !chat.enabled) return Promise.resolve(undefined);

  return cached(chats, req, chatId, async () => {
    const { docs } = await req.frogbot.find({
      collection: chat.chatsSlug,
      where: { id: { equals: chatId } },
      depth: 0,
      limit: 1,
      pagination: false,
      req,
      overrideAccess: true,
    });

    return docs[0];
  });
}

async function loadSpace({ req, id }: { req: FrogBotRequest; id: DocID }) {
  const chat = req.frogbot.config.chat;

  if (!chat.enabled) return undefined;

  const payloadConfig = await req.frogbot.config._internal.payloadConfig;
  const titleField =
    payloadConfig.collections.find(({ slug }) => slug === chat.spacesSlug)?.admin.useAsTitle ??
    'id';

  const [found, files] = await Promise.all([
    req.frogbot.find({
      collection: chat.spacesSlug,
      where: { id: { equals: id } },
      depth: 0,
      limit: 1,
      pagination: false,
      req,
      overrideAccess: true,
    }),
    req.frogbot.find({
      collection: chat.spaceFilesSlug,
      where: { space: { equals: id } },
      select: { filename: true },
      sort: 'filename',
      depth: 0,
      limit: SPACE_FILE_LIST_LIMIT,
      pagination: false,
      req,
      overrideAccess: true,
    }),
  ]);

  const space = found.docs[0] as Record<string, unknown> | undefined;

  if (!space) return undefined;

  const title = space[titleField];
  const instructions = space.instructions;

  return {
    id,
    title: typeof title === 'string' && title.trim() ? title.trim() : String(id),
    instructions: typeof instructions === 'string' ? instructions.trim() : '',
    files: files.docs.flatMap(({ filename }) =>
      typeof filename === 'string' && filename ? [filename] : [],
    ),
  };
}

/** The Space of the run's chat, or `undefined` when the chat has none or the run's user can no longer read it. */
export async function runSpace({
  req,
  chatId,
}: {
  req: FrogBotRequest;
  chatId: DocID | undefined;
}): Promise<RunSpace | undefined> {
  const id = spaceIDOf((await runChat({ req, chatId }))?.space);

  if (id === undefined) return undefined;

  return cached(spaces, req, id, async () => {
    if (req.user && !(await canAccessSpace({ req, id, kind: 'read' }))) return undefined;

    return loadSpace({ req, id });
  });
}
