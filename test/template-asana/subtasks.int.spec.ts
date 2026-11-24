import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { FrogBotInstance } from 'frogbot';
import { ensureAutonumbers } from 'frogbot/test';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import type { Task } from './frogbot-types.js';
import { filesDir, importsDir } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const system = { overrideAccess: true, depth: 0 };

describe('asana template subtasks', () => {
  let booted: BootedFrogBot;
  let frogbot: FrogBotInstance;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'template-asana-subtasks');
    frogbot = booted.frogbot;
  });

  afterAll(async () => {
    await booted.shutdown();
    await rm(filesDir, { recursive: true, force: true });
    await rm(importsDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await clearAndSeed(frogbot, 'empty');
    await ensureAutonumbers(frogbot);
  });

  const project = async (key: string) =>
    (await frogbot.create({
      collection: 'projects',
      data: { name: key, key },
      ...system,
    })) as { id: number | string };

  const task = async (data: Record<string, unknown>) =>
    (await frogbot.create({ collection: 'tasks', data, ...system } as never)) as Task;

  const update = async (id: Task['id'], data: Record<string, unknown>) =>
    (await frogbot.update({ collection: 'tasks', id, data, ...system } as never)) as Task;

  const read = (id: Task['id']) => frogbot.findByID({ collection: 'tasks', id, ...system });

  it('lets a subtask be completed after its parent is deleted', async () => {
    const web = await project('WEB');
    const parent = await task({ title: 'Pricing page', project: web.id });
    const subtask = await task({ title: 'FAQ', parent: parent.id });

    await frogbot.delete({ collection: 'tasks', id: parent.id, overrideAccess: true });

    await expect(update(subtask.id, { completed: true })).resolves.toMatchObject({
      completed: true,
    });

    const after = await read(subtask.id);

    expect(after.project).toBe(web.id);
    expect(after.parent ?? null).toBeNull();
  });

  it('moves a task’s subtasks with it when the task changes project', async () => {
    const web = await project('WEB');
    const app = await project('APP');
    const parent = await task({ title: 'Pricing page', project: web.id });
    const subtask = await task({ title: 'FAQ', parent: parent.id });
    const grandchild = await task({ title: 'Answers', parent: subtask.id });

    await update(parent.id, { project: app.id });

    expect((await read(parent.id)).project).toBe(app.id);

    const moved = await read(subtask.id);

    expect(moved.project).toBe(app.id);
    expect(moved.key).toMatch(/^APP-\d+$/);
    expect((await read(grandchild.id)).project).toBe(app.id);
  });

  it('keeps a moved task’s subtasks in its new project when it is parented across projects', async () => {
    const web = await project('WEB');
    const app = await project('APP');
    const target = await task({ title: 'Pricing page', project: web.id });
    const moved = await task({ title: 'Store listing', project: app.id });
    const child = await task({ title: 'Screenshots', parent: moved.id });

    const after = await update(moved.id, { parent: target.id });

    expect(after.project).toBe(web.id);
    expect(after.key).toMatch(/^WEB-\d+$/);
    expect((await read(child.id)).project).toBe(web.id);
  });
});
