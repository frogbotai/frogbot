import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GRAPHQL_POST } from '@frogbotai/next/routes';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../../__helpers/shared/clearAndSeed/index.js';
import { postsSlug } from '../shared.js';
import config from './config.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const graphQLPost = GRAPHQL_POST(config);

async function query(source: string) {
  const response = await graphQLPost(
    new Request('http://localhost/api/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: source }),
    }),
  );

  return response.json();
}

describe('custom GraphQL resolvers with search collections', () => {
  let booted: BootedFrogBot;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'graphql-search-override');
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  afterEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  it('a custom query overrides a generated search query and receives req.frogbot', async () => {
    await booted.frogbot.create({ collection: postsSlug, data: { title: 'Searchable post' } });

    const body = await query('{ searchPosts }');

    expect(body).toEqual({ data: { searchPosts: 'Custom search: 1' } });
  });

  it('a custom mutation receives req.frogbot when search queries are merged', async () => {
    const body = await query('mutation { addPost }');

    const post = await booted.frogbot.findByID({ collection: postsSlug, id: body.data.addPost });

    expect(body.errors).toBeUndefined();
    expect(post.title).toBe('From a search-enabled custom mutation');
  });
});
