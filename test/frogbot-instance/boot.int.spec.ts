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
});
