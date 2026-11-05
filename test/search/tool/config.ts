import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { buildConfig } from 'frogbot';
import { searchTool } from 'frogbot/tools';

import { Articles, articlesSlug, Notes, notesSlug, Users } from '../sqlite/shared.js';
import { agentSlug, databasePath, embedderModel, modelPort } from './shared.js';

const model = `test/${embedderModel}` as const;

export const articleWords = searchTool({
  collection: articlesSlug,
  index: 'content',
  select: { title: true },
});

export const articleMeaning = searchTool({
  collection: articlesSlug,
  index: 'content',
  select: { title: true },
  model,
  slug: 'search_articles_meaning',
});

export const noteWords = searchTool({
  collection: notesSlug,
  index: 'content',
  select: { title: true },
});

export const ratedArticles = searchTool({
  collection: articlesSlug,
  index: 'content',
  select: { title: true },
  where: { rating: { greater_than: 3 } },
});

export default buildConfig({
  secret: 'search-tool-test',
  db: sqliteAdapter({ client: { url: `file:${databasePath}` } }),
  typescript: { autoGenerate: false },
  collections: [Users, Articles, Notes],
  ai: {
    providers: {
      test: {
        type: 'openai-compatible',
        baseUrl: `http://127.0.0.1:${modelPort}/v1`,
        apiKey: 'test-key',
        models: [
          { id: 'chat', mode: 'chat' },
          { id: embedderModel, mode: 'embedding' },
        ],
      },
    },
  },
  agents: [
    {
      slug: agentSlug,
      model: 'test/chat',
      instructions: 'Answer from the knowledge base.',
      tools: [articleWords, articleMeaning, noteWords],
    },
  ],
});
