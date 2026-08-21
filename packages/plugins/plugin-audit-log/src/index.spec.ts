import type { FrogbotConfig } from 'frogbot';
import { describe, expect, it, vi } from 'vitest';

import { auditLogPlugin } from './index.js';

function config(): FrogbotConfig {
  return {
    secret: 'test',
    collections: [
      { slug: 'users', auth: true, fields: [] },
      { slug: 'posts', fields: [], hooks: { afterChange: [vi.fn()] } },
      { slug: 'notes', fields: [] },
    ],
  } as FrogbotConfig;
}

async function apply(options: Parameters<typeof auditLogPlugin>[0] = {}) {
  return auditLogPlugin(options)(config()) as FrogbotConfig;
}

function fieldNames(value: FrogbotConfig, slug = 'audit-logs') {
  return value.collections
    .find((collection) => collection.slug === slug)
    ?.fields.flatMap((field) => ('name' in field ? [field.name] : []));
}

describe('auditLogPlugin', () => {
  it('injects an immutable collection and preserves hooks', async () => {
    const result = await apply();
    const posts = result.collections.find((collection) => collection.slug === 'posts');
    const audit = result.collections.find((collection) => collection.slug === 'audit-logs');

    expect(posts?.hooks?.afterChange).toHaveLength(2);
    expect(posts?.hooks?.afterDelete).toHaveLength(1);
    expect(audit?.access?.create?.({} as never)).toBe(false);
    expect(audit?.access?.update?.({} as never)).toBe(false);
    expect(audit?.access?.delete?.({} as never)).toBe(false);
    expect(fieldNames(result)).not.toContain('ip');
  });

  it('supports include and exclude selection', async () => {
    const included = await apply({ collections: ['posts'] });
    expect(included.collections.find((item) => item.slug === 'posts')?.hooks?.afterDelete).toHaveLength(1);
    expect(included.collections.find((item) => item.slug === 'notes')?.hooks).toBeUndefined();

    const excluded = await apply({ collections: { exclude: ['posts'] } });
    expect(excluded.collections.find((item) => item.slug === 'posts')?.hooks?.afterChange).toHaveLength(1);
    expect(excluded.collections.find((item) => item.slug === 'notes')?.hooks?.afterChange).toHaveLength(1);
  });

  it('supports operation and metadata options', async () => {
    const result = await apply({ operations: ['delete'], ipAddress: true });
    const posts = result.collections.find((collection) => collection.slug === 'posts');
    expect(posts?.hooks?.afterChange).toHaveLength(1);
    expect(posts?.hooks?.afterDelete).toHaveLength(1);
    expect(fieldNames(result)).toEqual(expect.arrayContaining(['ip', 'userAgent']));
  });

  it('rejects collection slug collisions', async () => {
    expect(() => auditLogPlugin({ collectionSlug: 'posts' })(config())).toThrow(
      "Collection slug 'posts' already exists",
    );
  });

  it('registers and runs retention', async () => {
    const result = await apply({ retention: { days: 30, cron: '0 1 * * *' } });
    const task = result.jobs?.tasks?.at(-1);
    const remove = vi.fn().mockResolvedValue({});
    expect(task?.schedule).toEqual([
      { cron: '0 1 * * *', queue: 'frogbot-prune-audit-logs' },
    ]);
    await task?.handler({ req: { payload: { delete: remove } } } as never);
    expect(remove).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'audit-logs',
        overrideAccess: true,
        where: { timestamp: { less_than: expect.any(String) } },
      }),
    );
  });
});
