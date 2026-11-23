import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, type Page, test } from '@playwright/test';

import { setAdminTheme } from './__helpers/adminTheme';
import { prepareView, shootView, themes } from './__helpers/viewShots';
import { timezoneId, todayDate } from './fixtures/crm/shared';

const shots = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'test-results',
  'asana-views',
);

const views = [
  { name: 'tasks-list', path: '/collections/tasks' },
  { name: 'tasks-board', path: '/collections/tasks/board' },
  { name: 'tasks-timeline', path: `/collections/tasks/timeline?date=${todayDate}`, bars: true },
  {
    name: 'tasks-timeline-day',
    path: `/collections/tasks/timeline?date=${todayDate}&scale=day`,
    bars: true,
  },
];

test.use({ timezoneId });

function watchErrors(page: Page) {
  const errors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));

  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`response: ${response.status()} ${response.url()}`);
  });

  return errors;
}

for (const view of views) {
  test(`shoots the ${view.name} view with no errors`, async ({ page }) => {
    test.setTimeout(60_000);

    const errors = watchErrors(page);

    await prepareView(page);
    await page.goto(view.path);

    const files = await shootView(page, view.name, {
      path: shots,
      waitFor: view.bars ? '.frog-timeline__bar' : undefined,
    });

    expect(files).toHaveLength(4);

    for (const file of files) expect(existsSync(file)).toBe(true);

    expect(errors).toEqual([]);
  });
}

test('the tasks timeline shows every seeded task in its project band', async ({ page }) => {
  await prepareView(page);
  await page.goto(`/collections/tasks/timeline?date=${todayDate}&scale=week`);

  const labels = page.locator('.frog-timeline__band-label');

  await expect(labels).toHaveText(['Website relaunch', 'Mobile app beta', 'Support handbook']);

  const band = (name: string) =>
    page
      .locator('.frog-timeline__track')
      .nth(['Website relaunch', 'Mobile app beta', 'Support handbook'].indexOf(name));

  await expect(band('Website relaunch').locator('.frog-timeline__bar')).toHaveCount(5);
  await expect(band('Mobile app beta').locator('.frog-timeline__bar')).toHaveCount(4);
  await expect(band('Support handbook').locator('.frog-timeline__bar')).toHaveCount(3);

  const audit = page.locator('.frog-timeline__bar', { hasText: 'Run a performance audit' });
  const copy = page.locator('.frog-timeline__bar', { hasText: 'Write the homepage copy' });
  const dayWidth = await page
    .locator('.frog-timeline__track')
    .first()
    .evaluate((track) => track.getBoundingClientRect().width / 56);

  expect(Math.round(((await audit.boundingBox())?.width ?? 0) / dayWidth)).toBe(1);
  expect(Math.round(((await copy.boundingBox())?.width ?? 0) / dayWidth)).toBe(8);
});

test('a bar too short for its title shows the title beside it, clear of other bars', async ({
  page,
}) => {
  await prepareView(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/collections/tasks/timeline?date=${todayDate}&scale=week`);

  const audit = page.locator('.frog-timeline__bar', { hasText: 'Run a performance audit' });

  await expect(audit).toHaveAttribute('data-label-outside', /^(end|start)$/);

  const bar = (await audit.boundingBox())!;
  const title = (await audit.locator('.frog-timeline__bar-content').boundingBox())!;

  expect(title.x >= bar.x + bar.width || title.x + title.width <= bar.x).toBe(true);
  expect(title.width).toBeGreaterThan(40);

  const overlaps = await page.locator('.frog-timeline__track').evaluateAll((tracks) =>
    tracks.flatMap((track) => {
      const bars = [...track.querySelectorAll<HTMLElement>('.frog-timeline__bar')];

      return bars.flatMap((bar) => {
        const label = bar.querySelector<HTMLElement>('.frog-timeline__bar-content');

        if (!bar.dataset.labelOutside || !label) return [];

        const box = label.getBoundingClientRect();

        return bars
          .filter((other) => other !== bar)
          .map((other) => other.getBoundingClientRect())
          .filter(
            (other) =>
              other.top < box.bottom &&
              other.bottom > box.top &&
              other.left < box.right &&
              other.right > box.left,
          )
          .map(() => label.textContent);
      });
    }),
  );

  expect(overlaps).toEqual([]);

  for (const name of [
    'Write the homepage copy',
    'Set up redirects',
    'Fix the offline sync crash',
  ]) {
    await expect(page.locator('.frog-timeline__bar', { hasText: name })).not.toHaveAttribute(
      'data-label-outside',
    );
  }
});

const panelShots = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'test-results',
  'asana-panel',
);

const created: number[] = [];
const createdUsers: number[] = [];

const panel = (page: Page) => page.locator('.fb-record-panel');
const bar = (page: Page) => page.locator('.fb-record-panel-header');
const title = (page: Page) => page.locator('.fb-record-panel-title__input');
const subtasks = (page: Page) => panel(page).locator('.fb-panel-join');
const footer = (page: Page) => panel(page).locator('.fb-record-panel__footer');
const row = (page: Page, name: string) =>
  panel(page).locator('.fb-record-panel-properties__row', {
    has: page.locator(`#field-${name}, [id^="field-${name}"]`),
  });

type Task = { completed?: boolean; id: number; parent?: number; project?: number; status?: string };

async function findTask(page: Page, name: string) {
  const response = await page.request.get(
    `/api/tasks?where[title][equals]=${encodeURIComponent(name)}&depth=0`,
  );

  const { docs } = (await response.json()) as { docs: Task[] };

  return docs[0];
}

async function readTask(page: Page, id: number) {
  return (await (await page.request.get(`/api/tasks/${id}?depth=0`)).json()) as Task;
}

async function createTask(page: Page, data: Record<string, unknown>) {
  const response = await page.request.post('/api/tasks', { data });
  expect(response.ok()).toBe(true);
  const { doc } = (await response.json()) as { doc: Task };
  created.push(doc.id);

  return doc;
}

async function openTask(page: Page, id: number, name: string, view = '') {
  await page.goto(`/collections/tasks${view}?record=${id}`);
  await expect(title(page)).toHaveValue(name);
}

async function shootPanel(page: Page, caption: string) {
  const clip = (await panel(page).boundingBox())!;
  await page.screenshot({ clip, path: path.join(panelShots, `${caption}.png`) });
}

test.describe('the task panel', () => {
  test.beforeEach(async ({ page }) => {
    await prepareView(page);
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test.afterEach(async ({ page }) => {
    for (const id of created.splice(0).reverse()) await page.request.delete(`/api/tasks/${id}`);

    for (const id of createdUsers.splice(0)) await page.request.delete(`/api/users/${id}`);
  });

  test('a seeded task opens like Asana’s, and a subtask opens in place with a way back', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    const task = await findTask(page, 'Design the pricing page');

    await page.setViewportSize({ width: 1440, height: 1500 });

    await openTask(page, task.id, 'Design the pricing page', '/board');
    await expect(bar(page).getByRole('button', { name: 'Mark complete' })).toBeVisible();
    await expect(panel(page).locator('#field-completed')).toHaveCount(0);
    await expect(panel(page).locator('.fb-record-panel-properties__row label')).toHaveText([
      'Assignee',
      'Start Date',
      'Due Date',
      /^Project/,
      'Status',
    ]);
    await expect(row(page, 'startDate').locator('input')).toHaveValue('Jun 11');
    await expect(row(page, 'dueDate').locator('input')).toHaveValue('Jun 17');
    await expect(panel(page).locator('.relationship--single-value__drawer-toggler')).toHaveCount(0);
    await expect(
      panel(page).locator(
        ':is(#field-parent, #field-number, #field-key, #field-startDate, .file-field__upload):visible',
      ),
    ).toHaveCount(1);
    await expect(
      panel(page).locator('label:visible', { hasText: /^(Parent|Number|Key)$/ }),
    ).toHaveCount(0);
    await expect(panel(page).locator('#field-description')).toHaveAttribute(
      'placeholder',
      'What is this task about?',
    );
    await expect(subtasks(page).locator('.fb-panel-join__title')).toHaveText([
      'Sketch the plan comparison table',
      'Write the pricing FAQ',
    ]);
    await expect(subtasks(page).getByRole('button', { name: 'Completed' })).toHaveCount(1);
    await expect(panel(page).locator('.fb-panel-upload__file')).toHaveText([
      /pricing-notes(-\d+)?\.txt/,
    ]);
    await expect(panel(page).locator('.fb-pill-tabs')).toBeVisible();
    await expect(panel(page).locator('.fb-comments__item')).toHaveCount(2);
    await expect(
      footer(page).locator('.fb-comments--pinned [contenteditable="true"]'),
    ).toBeVisible();
    await expect(panel(page).locator('.fb-pill-tabs')).toBeInViewport();
    await shootPanel(page, '00-baseline-open-task');

    await row(page, 'dueDate').locator('input').hover();
    await shootPanel(page, '03-hover-due-date');

    await row(page, 'status').locator('.rs__control').click();
    await expect(page.locator('.rs__menu')).toBeVisible();
    await shootPanel(page, '04-edit-priority-dropdown');
    await page.keyboard.press('Escape');

    await subtasks(page).getByRole('button', { name: 'Write the pricing FAQ' }).click();
    await expect(title(page)).toHaveValue('Write the pricing FAQ');
    await expect(row(page, 'project')).toHaveCount(0);

    const back = bar(page).getByRole('button', { name: 'Back to Design the pricing page' });
    await expect(back).toHaveText('Design the pricing page');
    expect(
      await back
        .locator('.fb-side-panel-bar__back-label')
        .evaluate((label) => label.scrollWidth <= label.clientWidth),
    ).toBe(true);

    await shootPanel(page, '05-subtask-back-link');
    await back.click();
    await expect(title(page)).toHaveValue('Design the pricing page');
    expect(errors).toEqual([]);
  });

  test('+ adds a subtask inline in the parent’s project, and its check saves completed', async ({
    page,
  }) => {
    const parent = await findTask(page, 'Design the pricing page');

    await openTask(page, parent.id, 'Design the pricing page');
    await subtasks(page).getByRole('button', { name: 'Add task' }).click();

    const draft = subtasks(page).getByRole('textbox', { name: 'New task name' });
    await expect(draft).toBeFocused();
    await draft.fill('Price the add-ons');
    await draft.press('Enter');

    const added = subtasks(page).locator('.fb-panel-join__row', { hasText: 'Price the add-ons' });
    await expect(added).toBeVisible();
    await expect(draft).toHaveValue('');
    await expect(draft).toBeFocused();
    await expect(title(page)).toHaveValue('Design the pricing page');
    expect(Number(new URL(page.url()).searchParams.get('record'))).toBe(parent.id);

    await draft.press('Escape');
    await expect(draft).toHaveCount(0);
    await expect(panel(page)).toBeVisible();

    const subtask = await findTask(page, 'Price the add-ons');
    created.push(subtask.id);
    expect(subtask).toMatchObject({ parent: parent.id, project: parent.project });

    await added.getByRole('button', { name: 'Mark complete' }).click();
    await expect(added.getByRole('button', { name: 'Completed' })).toBeVisible();
    await expect
      .poll(async () => readTask(page, subtask.id))
      .toMatchObject({ completed: true, status: 'done' });
  });

  test('Attachments + uploads a file to the task, and × removes it', async ({ page }) => {
    const parent = await findTask(page, 'Design the pricing page');
    const task = await createTask(page, { title: 'Collect the logos', project: parent.project });
    const section = panel(page).locator('.fb-panel-upload');

    await openTask(page, task.id, 'Collect the logos');

    for (const [name, placeholder] of [
      ['startDate', 'No start date'],
      ['dueDate', 'No due date'],
    ]) {
      await expect(row(page, name).locator('input')).toHaveValue('');
      await expect(row(page, name).locator('input')).toHaveAttribute('placeholder', placeholder);
    }

    await expect(section.locator('.fb-panel-section__heading')).toHaveText('Attachments');
    await expect(section.locator('.fb-panel-upload__file')).toHaveCount(0);

    const chooser = page.waitForEvent('filechooser');
    await section.getByRole('button', { name: 'Add file' }).click();

    await (
      await chooser
    ).setFiles({ name: 'logo-sheet.txt', mimeType: 'text/plain', buffer: Buffer.from('logos') });

    const file = section.locator('.fb-panel-upload__file', { hasText: /logo-sheet(-\d+)?\.txt/ });
    await expect(file).toBeVisible();
    await expect
      .poll(
        async () => ((await readTask(page, task.id)) as { attachments?: unknown[] }).attachments,
      )
      .toHaveLength(1);

    await file.hover();
    await file.getByRole('button', { name: /^Remove logo-sheet/ }).click();
    await expect(section.locator('.fb-panel-upload__file')).toHaveCount(0);
    await expect
      .poll(
        async () => ((await readTask(page, task.id)) as { attachments?: unknown[] }).attachments,
      )
      .toEqual([]);
  });

  test('a member who can’t edit the task gets no attachment + or remove', async ({
    browser,
    page,
  }) => {
    const email = `member-${Date.now()}@example.com`;
    const made = await page.request.post('/api/users', {
      data: { email, password: 'frogbot-test', roles: ['member'] },
    });

    expect(made.ok()).toBe(true);

    const { doc: user } = (await made.json()) as { doc: { id: number } };

    createdUsers.push(user.id);

    const task = await findTask(page, 'Design the pricing page');
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      timezoneId,
    });

    const member = await context.newPage();
    const login = await member.request.post('/api/users/login', {
      data: { email, password: 'frogbot-test' },
    });

    expect(login.ok()).toBe(true);
    expect((await member.request.patch(`/api/tasks/${task.id}`, { data: {} })).status()).toBe(403);

    await openTask(member, task.id, 'Design the pricing page');

    const section = panel(member).locator('.fb-panel-upload');

    await expect(section.locator('.fb-panel-upload__file')).toHaveCount(1);
    await expect(section.getByRole('button', { name: 'Add file' })).toHaveCount(0);
    await expect(section.getByRole('button', { name: /^Remove/ })).toHaveCount(0);
    await context.close();
  });

  test('the pinned box stays put while the task scrolls, and a post shows in the tab', async ({
    page,
  }) => {
    const parent = await findTask(page, 'Design the pricing page');
    const task = await createTask(page, {
      title: 'Plan the launch email',
      project: parent.project,
      description: 'Line\n'.repeat(80),
    });

    await page.setViewportSize({ width: 1280, height: 600 });
    await openTask(page, task.id, 'Plan the launch email');

    const pinned = footer(page).locator('.fb-comments--pinned');
    await expect(pinned).toBeVisible();
    expect((await pinned.boundingBox())!.height).toBeLessThan(60);
    await expect(panel(page).locator('.fb-record-panel__body .fb-comments__box')).toHaveCount(0);

    const before = (await pinned.boundingBox())!;

    await panel(page)
      .locator('.fb-record-panel__body')
      .evaluate((body) => body.scrollTo({ top: body.scrollHeight }));

    await expect(title(page)).not.toBeInViewport();
    expect((await pinned.boundingBox())!.y).toBe(before.y);

    const complete = bar(page).getByRole('button', { name: 'Mark complete' });
    await expect(complete).toHaveClass(/__complete--compact/);
    await expect(complete.locator('.fb-record-panel-header__complete-label')).toBeHidden();
    await expect(bar(page).locator('.fb-side-panel-bar__title')).toHaveText(
      'Plan the launch email',
    );

    const editor = pinned.locator('[contenteditable="true"]');
    const send = pinned.getByRole('button', { name: 'Comment' });

    expect((await pinned.boundingBox())!.height).toBeLessThan(60);
    await expect(send).toBeDisabled();
    await expect(editor).toBeVisible();
    await shootPanel(page, '07-scrolled-compact-complete');
    await editor.click();
    await page.keyboard.type('Draft is in the doc.');
    await expect(pinned.locator('.ContentEditable__keyboard-hint')).toBeHidden();
    await expect(pinned.locator('.add-block-menu, .insert-paragraph-at-end')).toHaveCount(0);

    const box = (await pinned.locator('.fb-comments__editor--compact').boundingBox())!;
    const button = (await send.boundingBox())!;
    expect(button.x + button.width).toBeLessThanOrEqual(box.x + box.width);
    expect(button.y + button.height).toBeLessThanOrEqual(box.y + box.height);

    await send.click();

    await expect(
      panel(page).locator('.fb-record-panel__body .fb-comments__item', {
        hasText: 'Draft is in the doc.',
      }),
    ).toBeVisible();
    await expect(panel(page).locator('.fb-comments__box')).toHaveCount(1);
  });

  test('Mark complete shows Completed, sets Done and moves the card to Done', async ({ page }) => {
    const parent = await findTask(page, 'Design the pricing page');
    const task = await createTask(page, {
      title: 'Book the launch review',
      project: parent.project,
      status: 'in-progress',
    });

    const column = (label: string) =>
      page.locator('.frog-board__column', {
        has: page.locator('.frog-board__column-header', { hasText: label }),
      });

    await openTask(page, task.id, 'Book the launch review', '/board');

    await expect(
      column('In progress').locator('.frog-board__card', { hasText: 'Book the launch review' }),
    ).toBeVisible();

    const complete = bar(page).locator('.fb-side-panel-bar__lead').getByRole('button', {
      name: 'Mark complete',
    });

    const close = bar(page).getByRole('button', { name: 'Close' });
    expect((await complete.boundingBox())!.x).toBeLessThan((await close.boundingBox())!.x);

    await complete.click();
    await expect(bar(page).getByRole('button', { name: 'Completed' })).toBeVisible();
    await expect
      .poll(async () => readTask(page, task.id))
      .toMatchObject({ completed: true, status: 'done' });
    await expect(
      column('Done').locator('.frog-board__card', { hasText: 'Book the launch review' }),
    ).toBeVisible();
    await expect(row(page, 'status').locator('.rs__single-value')).toHaveText('Done');
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
    await shootPanel(page, '06-completed-task-full');
  });

  test('an unsaved edit hides Mark complete until Save, so completing never saves it', async ({
    page,
  }) => {
    const parent = await findTask(page, 'Design the pricing page');
    const task = await createTask(page, { title: 'Check the copy', project: parent.project });

    await openTask(page, task.id, 'Check the copy');
    await title(page).fill('');
    await expect(bar(page).getByRole('button', { name: 'Save' })).toBeVisible();
    await expect(bar(page).locator('.fb-side-panel-bar__lead')).toHaveCount(0);

    await title(page).fill('Check the copy');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await expect(bar(page).getByRole('button', { name: 'Mark complete' })).toBeVisible();
    expect(await readTask(page, task.id)).toMatchObject({ completed: false });
  });

  test('Mark complete shows its whole focus ring in the lead slot', async ({ page }) => {
    const task = await findTask(page, 'Design the pricing page');
    await openTask(page, task.id, 'Design the pricing page');
    const complete = bar(page).locator('.fb-side-panel-bar__lead button');
    await expect(complete).toBeVisible();
    await complete.focus();

    const geometry = await complete.evaluate((button) => {
      const style = getComputedStyle(button);
      const ring =
        style.outlineStyle === 'none'
          ? 0
          : parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);

      const box = button.getBoundingClientRect();
      const start = button.closest('.fb-side-panel-bar__start')!;
      const clip = start.getBoundingClientRect();

      return {
        clipBottom: clip.bottom,
        clipLeft: clip.left,
        clipTop: clip.top,
        focusVisible: button.matches(':focus-visible'),
        overflow: getComputedStyle(start).overflow,
        ring,
        ringBottom: box.bottom + ring,
        ringLeft: box.left - ring,
        ringTop: box.top - ring,
      };
    });

    expect(geometry.focusVisible).toBe(true);
    expect(geometry.ring).toBeGreaterThan(0);
    expect(geometry.overflow).toBe('hidden');
    expect(geometry.ringLeft).toBeGreaterThanOrEqual(geometry.clipLeft);
    expect(geometry.ringTop).toBeGreaterThanOrEqual(geometry.clipTop);
    expect(geometry.ringBottom).toBeLessThanOrEqual(geometry.clipBottom);
  });

  test('shoots the open task in light and dark, wide and narrow', async ({ page }) => {
    test.setTimeout(60_000);

    const task = await findTask(page, 'Design the pricing page');

    for (const theme of themes) {
      await setAdminTheme(page, theme);

      for (const viewport of [
        { width: 1280, height: 1400 },
        { width: 375, height: 1400 },
      ]) {
        await page.setViewportSize(viewport);
        await openTask(page, task.id, 'Design the pricing page');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(panel(page).locator('.fb-comments__item')).toHaveCount(2);
        await expect(row(page, 'dueDate').locator('input')).toHaveValue('Jun 17');
        await expect(panel(page).locator('.fb-panel-upload__file')).toHaveCount(1);
        await shootPanel(page, `panel-${theme}-${viewport.width}`);
      }
    }
  });
});
