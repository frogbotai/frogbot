import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('frogbot-instance: boot', () => {
  let booted: BootedFrogBot;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname);
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  it('boots successfully and exposes the frogbot instance', () => {
    expect(booted.frogbot).toBeDefined();
    expect(booted.frogbot.collections).toBeDefined();
  });

  it('registers the posts collection with versions enabled', () => {
    expect(booted.frogbot.collections['posts']).toBeDefined();
  });

  it('registers the users collection with auth enabled', () => {
    expect(booted.frogbot.collections['users']).toBeDefined();
    expect(booted.frogbot.collections['users'].auth).toBe(true);
  });

  it('registers no files, folders or trigger subscription collections', () => {
    const slugs = Object.keys(booted.frogbot.collections);

    expect(slugs).not.toContain('files');
    expect(slugs).not.toContain('payload-folders');
    expect(slugs).not.toContain('frogbot-trigger-subscriptions');
  });

  it('frogbot.triggers.list() rejects without agent triggers or channels', async () => {
    await expect(booted.frogbot.triggers.list()).rejects.toThrow();
    await expect(booted.frogbot.triggers.list()).rejects.toThrow('frogbot-trigger-subscriptions');
  });

  it('POST /api/webhooks/:instance/:id returns 404 without agent triggers or channels', async () => {
    const response = await booted.restClient.post('/api/webhooks/old/1', {});

    expect(response.status).toBe(404);
  });
});
