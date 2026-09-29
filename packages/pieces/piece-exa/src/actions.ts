import { z } from 'zod';

import { defineAction } from './define.js';

const result = z
  .object({
    id: z.string().optional(),
    url: z.string(),
    title: z.string().nullable().optional(),
    publishedDate: z.string().optional(),
    author: z.string().optional(),
    text: z.string().optional(),
  })
  .passthrough();
const results = z.array(result);
const dates = {
  startCrawlDate: z.string().datetime({ offset: true }).optional(),
  endCrawlDate: z.string().datetime({ offset: true }).optional(),
  startPublishedDate: z.string().datetime({ offset: true }).optional(),
  endPublishedDate: z.string().datetime({ offset: true }).optional(),
};
const filters = {
  numResults: z.number().int().min(1).max(100).optional(),
  includeDomains: z.array(z.string()).optional(),
  excludeDomains: z.array(z.string()).optional(),
  ...dates,
  includeText: z.array(z.string()).optional(),
  excludeText: z.array(z.string()).optional(),
};

const searchInput = z.object({
  query: z.string().min(1),
  type: z.enum(['auto', 'keyword', 'neural']).default('auto'),
  category: z
    .enum([
      'company',
      'research paper',
      'news',
      'pdf',
      'github',
      'tweet',
      'personal site',
      'linkedin profile',
      'financial report',
    ])
    .optional(),
  ...filters,
  numResults: filters.numResults.default(10),
});

export const search = defineAction({
  slug: 'search',
  label: 'Search',
  description: 'Search the web using semantic or keyword-based search.',
  idempotent: true,
  input: searchInput,
  output: results,
  async run({ input, client, req }) {
    const response = await client<{ results: z.output<typeof results> }>(
      '/search',
      { ...input, contents: { text: true } },
      req.signal ?? undefined,
    );

    return response.results;
  },
});

const getContentsInput = z.object({
  urls: z.array(z.string().url()).min(1),
  text: z.boolean().default(true),
  livecrawl: z.enum(['never', 'fallback', 'always', 'auto']).optional(),
  livecrawlTimeout: z.number().int().nonnegative().optional(),
  subpages: z.number().int().nonnegative().optional(),
  subpageTarget: z.string().optional(),
});

export const getContents = defineAction({
  slug: 'getContents',
  label: 'Get contents',
  description: 'Retrieve clean content from specified URLs.',
  idempotent: true,
  input: getContentsInput,
  output: results,
  async run({ input, client, req }) {
    const response = await client<{ results: z.output<typeof results> }>(
      '/contents',
      input,
      req.signal ?? undefined,
    );

    return response.results;
  },
});

const generateAnswerInput = z.object({
  query: z.string().min(1),
  text: z.boolean().default(true),
  model: z.enum(['exa', 'exa-pro']).default('exa'),
});

export const generateAnswer = defineAction({
  slug: 'generateAnswer',
  label: 'Generate answer',
  description: 'Answer a question using live web search results.',
  idempotent: true,
  input: generateAnswerInput,
  output: z.string(),
  async run({ input, client, req }) {
    const response = await client<{ answer: string }>('/answer', input, req.signal ?? undefined);

    return response.answer;
  },
});

const findSimilarPagesInput = z.object({
  url: z.string().url(),
  ...filters,
  numResults: filters.numResults.default(10),
});

export const findSimilarPages = defineAction({
  slug: 'findSimilarPages',
  label: 'Find similar pages',
  description: 'Find web pages similar to a reference URL.',
  idempotent: true,
  input: findSimilarPagesInput,
  output: results,
  async run({ input, client, req }) {
    const response = await client<{ results: z.output<typeof results> }>(
      '/findSimilar',
      input,
      req.signal ?? undefined,
    );

    return response.results;
  },
});
