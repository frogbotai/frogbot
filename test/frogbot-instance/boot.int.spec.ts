import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { BootedFrogbot } from '../__helpers/shared/bootFrogbot';
import { bootFrogbot } from '../__helpers/shared/bootFrogbot';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('frogbot-instance: boot', () => {
  let booted: BootedFrogbot;

  beforeAll(async () => { booted = await bootFrogbot(dirname); });
  afterAll(async () => { await booted.shutdown(); });

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
