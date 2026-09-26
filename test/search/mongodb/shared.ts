import type { FrogBotInstance } from 'frogbot';

export const articlesSlug = 'search-articles';

export const authorsSlug = 'search-authors';

export const postsSlug = 'search-posts';

export const searchURI = process.env.MONGODB_SEARCH_URI;

export const skipSearch = process.env.FROGBOT_DATABASE !== 'mongodb' || !searchURI;

export function useSearchDatabase(): () => void {
  const previous = process.env.MONGODB_URI;

  process.env.MONGODB_URI = searchURI;

  return () => {
    if (previous === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = previous;
  };
}

export type SeededArticles = {
  author: string;
  fox: string;
  hounds: string;
  cats: string;
  secret: string;
};

export async function waitFor<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  timeout = 30000,
): Promise<T> {
  const started = Date.now();

  for (;;) {
    const value = await read().catch((error: unknown) => error as T);

    if (!(value instanceof Error) && done(value)) return value;

    if (Date.now() - started > timeout) {
      throw new Error(`Timed out waiting for search state: ${String(value)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

export async function seedArticles(frogbot: FrogBotInstance): Promise<SeededArticles> {
  const author = await frogbot.create({
    collection: authorsSlug,
    data: { name: 'Ada' },
    overrideAccess: true,
  });

  const create = async (data: Record<string, unknown>) =>
    String((await frogbot.create({ collection: articlesSlug, data, overrideAccess: true })).id);

  const fox = await create({
    title: 'The quick brown fox',
    body: 'A fox jumps over the lazy dog',
    rank: 1,
    featured: true,
    publishedAt: '2024-01-01T00:00:00.000Z',
    author: author.id,
    tags: ['a'],
    embedding: [1, 0, 0],
    meta: { summary: 'fox summary', embedding: [1, 1, 0] },
  });

  const hounds = await create({
    title: 'Foxes and hounds',
    body: 'Hounds chase a fox',
    rank: 2,
    featured: false,
    publishedAt: '2025-06-01T00:00:00.000Z',
    embedding: [0.8, 0.2, 0],
    meta: { summary: 'hounds summary here', embedding: [0, 1, 0] },
  });

  const cats = await create({
    title: 'Cats',
    body: 'Cats sleep all day',
    rank: 3,
    embedding: [0, 1, 0],
    meta: { summary: 'cats summary with more words', embedding: [5, 5, 5] },
  });

  const secret = await create({
    title: 'Secret fox',
    body: 'A private fox',
    visibility: 'private',
    rank: 4,
    embedding: [1, 0, 0],
    meta: { summary: 'secret summary', embedding: [1, 1, 0] },
  });

  return { author: String(author.id), fox, hounds, cats, secret };
}
