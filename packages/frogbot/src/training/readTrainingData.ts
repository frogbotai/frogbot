import type { Frogbot } from '../frogbot.js';
import type { CollectionSlug } from '../types/generated.js';
import type {
  ReadTrainingDataOptions,
  TrainingDataDocument,
  TrainingDataRecord,
} from './types.js';

const DEFAULT_PAGE_SIZE = 100;

export async function* readTrainingData(
  frogbot: Frogbot,
  options: ReadTrainingDataOptions = {},
): AsyncGenerator<TrainingDataRecord> {
  if (!frogbot.config.chat.enabled) {
    throw new Error('Training data export requires chat persistence.');
  }

  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error('Training data export pageSize must be a positive integer.');
  }

  const common = {
    depth: 0,
    limit: pageSize,
    overrideAccess: options.overrideAccess ?? false,
    req: options.req,
  };
  let threadPage = 1;

  while (true) {
    const threads = await frogbot.find({
      ...common,
      collection: frogbot.config.chat.threadsSlug as CollectionSlug,
      page: threadPage,
      sort: ['createdAt', 'id'],
      where: options.where,
    });

    for (const thread of threads.docs) {
      const messages: TrainingDataDocument[] = [];
      let messagePage = 1;

      while (true) {
        const result = await frogbot.find({
          ...common,
          collection: frogbot.config.chat.messagesSlug as CollectionSlug,
          page: messagePage,
          sort: ['createdAt', 'id'],
          where: { thread: { equals: thread.id } },
        });
        messages.push(...result.docs);
        if (!result.hasNextPage) break;
        messagePage += 1;
      }

      yield { thread, messages };
    }

    if (!threads.hasNextPage) break;
    threadPage += 1;
  }
}
