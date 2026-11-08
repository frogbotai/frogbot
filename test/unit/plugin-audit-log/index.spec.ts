import type { Field, FrogBotConfig } from 'frogbot';
import { describe, expect, it, vi } from 'vitest';

import { buildConfig } from '../../../packages/frogbot/src/config/build.js';
import { auditLogPlugin } from '../../../packages/plugins/plugin-audit-log/src/index.js';

type Task = NonNullable<NonNullable<FrogBotConfig['jobs']>['tasks']>[number];

function config(): FrogBotConfig {
  return {
    secret: 'test',
    db: {} as FrogBotConfig['db'],
    collections: [
      { slug: 'users', auth: true, fields: [] },
      { slug: 'posts', fields: [], hooks: { afterChange: [vi.fn()] } },
      { slug: 'notes', fields: [] },
    ],
  };
}

function apply(options: Parameters<typeof auditLogPlugin>[0] = {}): Promise<FrogBotConfig> {
  return Promise.resolve(auditLogPlugin(options)(config()));
}

async function runTask(task: Task | undefined, req: object): Promise<void> {
  const handler = task?.handler;

  if (typeof handler !== 'function') throw new Error('Expected an inline task handler.');

  await handler({ req } as unknown as Parameters<typeof handler>[0]);
}

function fieldNames(value: FrogBotConfig, slug = 'audit-logs') {
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

    expect(
      included.collections.find((item) => item.slug === 'posts')?.hooks?.afterDelete,
    ).toHaveLength(1);
    expect(included.collections.find((item) => item.slug === 'notes')?.hooks).toBeUndefined();

    const excluded = await apply({ collections: { exclude: ['posts'] } });

    expect(
      excluded.collections.find((item) => item.slug === 'posts')?.hooks?.afterChange,
    ).toHaveLength(1);
    expect(
      excluded.collections.find((item) => item.slug === 'notes')?.hooks?.afterChange,
    ).toHaveLength(1);
  });

  it('supports operation and metadata options', async () => {
    const result = await apply({ operations: ['delete'], ipAddress: true });
    const posts = result.collections.find((collection) => collection.slug === 'posts');

    expect(posts?.hooks?.afterChange).toHaveLength(1);
    expect(posts?.hooks?.afterDelete).toHaveLength(1);
    expect(fieldNames(result)).toEqual(expect.arrayContaining(['ip', 'userAgent']));
  });

  it('rejects collection slug collisions', () => {
    expect(() => auditLogPlugin({ overrides: { slug: 'posts' } })(config())).toThrow(
      "Collection slug 'posts' already exists",
    );
  });

  it('applies collection overrides over the defaults', async () => {
    const read = vi.fn(() => true);
    const result = await apply({
      overrides: { slug: 'activity', access: { read }, admin: { group: 'Logs' } },
      retention: { days: 30 },
    });

    const audit = result.collections.find((collection) => collection.slug === 'activity');

    expect(result.collections.some((collection) => collection.slug === 'audit-logs')).toBe(false);
    expect(audit?.access?.read).toBe(read);
    expect(audit?.access?.create?.({} as never)).toBe(false);
    expect(audit?.access?.update?.({} as never)).toBe(false);
    expect(audit?.access?.delete?.({} as never)).toBe(false);
    expect(audit?.admin).toEqual(expect.objectContaining({ group: 'Logs', icon: 'clock' }));
    expect(result.jobs?.tasks?.at(-1)?.slug).toBe('frogbot-prune-activity');
  });

  it('rejects overrides.fields that drop a built-in field', () => {
    expect(() =>
      auditLogPlugin({
        overrides: {
          fields: ({ defaultFields }) =>
            defaultFields.filter((field) => !('name' in field) || field.name !== 'changes'),
        },
      })(config()),
    ).toThrow("[plugin-audit-log] overrides.fields must keep 'changes'.");
  });

  it('rejects overrides.fields that name a field twice', () => {
    expect(() =>
      auditLogPlugin({
        overrides: {
          fields: ({ defaultFields }) => [...defaultFields, { name: 'changes', type: 'json' }],
        },
      })(config()),
    ).toThrow("[plugin-audit-log] overrides.fields names 'changes' twice.");
  });

  it('requires ip and userAgent only when ipAddress is on', () => {
    const fields = ({ defaultFields }: { defaultFields: Field[] }) =>
      defaultFields.filter((field) => !('name' in field) || field.name !== 'userAgent');

    expect(() => auditLogPlugin({ overrides: { fields } })(config())).not.toThrow();
    expect(() => auditLogPlugin({ ipAddress: true, overrides: { fields } })(config())).toThrow(
      "[plugin-audit-log] overrides.fields must keep 'userAgent'.",
    );
  });

  it('registers no retention task by default', async () => {
    expect((await apply()).jobs?.tasks ?? []).toHaveLength(0);
    expect((await apply({ retention: false })).jobs?.tasks ?? []).toHaveLength(0);
  });

  it('schedules retention on the default queue at midnight', async () => {
    const task = (await apply({ retention: { days: 30 } })).jobs?.tasks?.at(-1);

    expect(task?.slug).toBe('frogbot-prune-audit-logs');
    expect(task?.schedule).toEqual([{ cron: '0 0 * * *', queue: 'default' }]);
  });

  it('keeps a custom retention cron', async () => {
    const task = (await apply({ retention: { days: 30, cron: '0 1 * * *' } })).jobs?.tasks?.at(-1);

    expect(task?.schedule).toEqual([{ cron: '0 1 * * *', queue: 'default' }]);
  });

  it.each([0, 1.5])('rejects retention.days of %s', (days) => {
    expect(() => auditLogPlugin({ retention: { days } })).toThrow(
      '[plugin-audit-log] retention.days must be a positive integer.',
    );
  });

  it('rejects an invalid retention.cron when the config is built', async () => {
    await expect(
      buildConfig({
        ...config(),
        plugins: [auditLogPlugin({ retention: { days: 30, cron: 'nightly' } })],
      }),
    ).rejects.toThrow(
      "[frogbot] Task 'frogbot-prune-audit-logs' schedule 0 has an invalid cron expression: 'nightly'.",
    );
  });

  it('prunes expired entries in batches by id', async () => {
    const task = (await apply({ retention: { days: 30 } })).jobs?.tasks?.at(-1);
    const find = vi
      .fn()
      .mockResolvedValueOnce({ docs: [{ id: 1 }, { id: 2 }] })
      .mockResolvedValueOnce({ docs: [{ id: 3 }] })
      .mockResolvedValueOnce({ docs: [] });

    const remove = vi.fn().mockResolvedValue({ docs: [], errors: [] });

    await runTask(task, { frogbot: { find, delete: remove } });

    expect(find).toHaveBeenCalledTimes(3);
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'audit-logs',
        where: { timestamp: { less_than: expect.any(String) } },
        limit: 100,
        sort: 'timestamp',
        depth: 0,
        overrideAccess: true,
      }),
    );
    expect(new Set(find.mock.calls.map(([args]) => args.where.timestamp.less_than)).size).toBe(1);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        collection: 'audit-logs',
        where: { id: { in: [1, 2] } },
        overrideAccess: true,
      }),
    );
    expect(remove).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { id: { in: [3] } } }),
    );
  });

  it('fails the prune when a batch delete reports errors', async () => {
    const task = (await apply({ retention: { days: 30 } })).jobs?.tasks?.at(-1);
    const find = vi.fn().mockResolvedValue({ docs: [{ id: 1 }] });
    const remove = vi
      .fn()
      .mockResolvedValue({ docs: [], errors: [{ id: 1, message: 'delete refused' }] });

    await expect(runTask(task, { frogbot: { find, delete: remove } })).rejects.toThrow(
      'delete refused',
    );
    expect(find).toHaveBeenCalledTimes(1);
  });
});
