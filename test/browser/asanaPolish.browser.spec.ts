import { expect, type Page, test } from '@playwright/test';

import { prepareView } from './__helpers/viewShots';
import { timezoneId, todayDate } from './fixtures/crm/shared';

test.use({ timezoneId });

type Task = { id: number; project?: number };

const tasks: number[] = [];
const users: number[] = [];

const panel = (page: Page) => page.locator('.fb-record-panel');
const panelBody = (page: Page) => panel(page).locator('.fb-record-panel__body');
const title = (page: Page) => page.locator('.fb-record-panel-title__input');

async function findTask(page: Page, name: string) {
  const response = await page.request.get(
    `/api/tasks?where[title][equals]=${encodeURIComponent(name)}&depth=0`,
  );

  return ((await response.json()) as { docs: Task[] }).docs[0];
}

function paragraph(text: string) {
  return {
    root: {
      type: 'root',
      children: [{ type: 'paragraph', children: [{ type: 'text', text, version: 1 }], version: 1 }],
      version: 1,
    },
  };
}

test.beforeEach(async ({ page }) => {
  await prepareView(page);
  await page.setViewportSize({ width: 1440, height: 900 });
});

test.afterEach(async ({ page }) => {
  for (const id of tasks.splice(0)) await page.request.delete(`/api/tasks/${id}`);

  for (const id of users.splice(0)) {
    await page.request.delete(`/api/comments?where[author][equals]=${id}`);
    await page.request.delete(`/api/users/${id}`);
  }
});

test('a subtask opened from a scrolled parent shows its title at the top', async ({ page }) => {
  const parent = await findTask(page, 'Design the pricing page');

  await page.setViewportSize({ width: 1440, height: 600 });
  await page.goto(`/collections/tasks?record=${parent.id}`);
  await expect(title(page)).toHaveValue('Design the pricing page');

  const subtask = panel(page).locator('.fb-panel-join__title', {
    hasText: 'Write the pricing FAQ',
  });

  await subtask.scrollIntoViewIfNeeded();
  await expect(title(page)).not.toBeInViewport();
  expect(await panelBody(page).evaluate((body) => body.scrollTop)).toBeGreaterThan(0);

  await subtask.click();
  await expect(title(page)).toHaveValue('Write the pricing FAQ');
  await expect.poll(() => panelBody(page).evaluate((body) => body.scrollTop)).toBe(0);
  await expect(title(page)).toBeInViewport();
});

test('the board hides the empty no-value column, and shows it for a card with no status', async ({
  page,
}) => {
  await page.goto('/collections/tasks/board');

  const columns = page.locator('.frog-board__column');
  const noValue = columns.filter({ hasText: 'Uncategorized' });

  await expect(columns.filter({ hasText: 'Done' })).toHaveCount(1);
  await expect(noValue).toHaveCount(0);

  const parent = await findTask(page, 'Design the pricing page');
  const response = await page.request.post('/api/tasks', {
    data: { project: parent.project, status: null, title: 'Triage the inbox' },
  });

  tasks.push(((await response.json()) as { doc: Task }).doc.id);

  await page.reload();
  await expect(noValue).toHaveCount(1);
  await expect(noValue.locator('.frog-board__card')).toHaveText([/Triage the inbox/]);
});

test('list rows stay on one line with the panel open, and the table scrolls sideways', async ({
  page,
}) => {
  const task = await findTask(page, 'Design the pricing page');

  await page.goto(`/collections/tasks?record=${task.id}`);
  await expect(title(page)).toHaveValue('Design the pricing page');

  const rows = page.locator('.collection-view--list tbody > tr');
  const heights = await rows.evaluateAll((all) =>
    all.map((row) => Math.round(row.getBoundingClientRect().height)),
  );

  expect(heights.length).toBeGreaterThan(5);
  expect(Math.max(...heights)).toBeLessThan(48);

  const clipped = await page
    .locator('.collection-view--list thead th')
    .evaluateAll((headers) =>
      headers
        .filter((header) => header.scrollWidth > header.clientWidth + 1)
        .map((header) => header.textContent),
    );

  expect(clipped).toEqual([]);

  const titleCell = page.locator('.collection-view--list tbody td.cell-title').first();

  expect((await titleCell.boundingBox())!.width).toBeGreaterThanOrEqual(200);
});

test('the board toolbar’s Sort pill fits its label at 760px', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 900 });
  await page.goto('/collections/tasks/board');

  const sort = page.locator('.list-controls__toggle-sort');

  await expect(sort).toBeVisible();
  expect((await sort.boundingBox())!.width).toBeLessThan(120);
});

test('timeline bars are never slivers or empty, and inside labels end in an ellipsis', async ({
  page,
}) => {
  await page.goto(`/collections/tasks/timeline?date=${todayDate}&scale=month`);
  await expect(page.locator('.frog-timeline__bar')).toHaveCount(12);
  await expect(page.locator('.frog-timeline__bar[data-label-outside]').first()).toBeVisible();

  const bars = await page.locator('.frog-timeline__bar').evaluateAll((all) =>
    all.map((bar) => {
      const box = bar.getBoundingClientRect();
      const text = bar.querySelector<HTMLElement>('.collection-timeline__title-text')!;
      const textBox = text.getBoundingClientRect();

      return {
        background: getComputedStyle(bar).backgroundColor,
        done: bar.classList.contains('fb-record--done'),
        ellipsis: getComputedStyle(text).textOverflow,
        outside: Boolean((bar as HTMLElement).dataset.labelOutside),
        overflowsBar: textBox.right > box.right + 1,
        title: text.textContent,
        truncated: text.scrollWidth > text.clientWidth,
        width: box.width,
      };
    }),
  );

  const inside = bars.filter((bar) => !bar.outside);
  const outside = bars.filter((bar) => bar.outside);
  const plain = inside[0].background;

  expect(bars.filter((bar) => bar.width < 20).map((bar) => bar.title)).toEqual([]);
  expect(outside.some((bar) => bar.done)).toBe(true);
  expect(outside.filter((bar) => bar.background === plain).map((bar) => bar.title)).toEqual([]);
  expect(inside.filter((bar) => bar.overflowsBar).map((bar) => bar.title)).toEqual([]);
  expect(inside.some((bar) => bar.truncated)).toBe(true);

  for (const bar of inside.filter(({ truncated }) => truncated)) {
    expect(bar.ellipsis).toBe('ellipsis');
  }
});

test('a comment by a user named only by their email shows a name, not the raw email', async ({
  browser,
  page,
}) => {
  const task = await findTask(page, 'Design the pricing page');
  const email = `riley-${Date.now()}@example.com`;
  const created = await page.request.post('/api/users', {
    data: { email, password: 'frogbot-test', roles: ['member'] },
  });

  users.push(((await created.json()) as { doc: { id: number } }).doc.id);

  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const member = await context.newPage();

  await member.request.post('/api/users/login', { data: { email, password: 'frogbot-test' } });

  const posted = await member.request.post('/api/comments', {
    data: {
      body: paragraph('Looks good to me.'),
      collection: 'tasks',
      documentId: String(task.id),
    },
  });

  expect(posted.ok()).toBe(true);
  await context.close();

  await page.goto(`/collections/tasks?record=${task.id}`);

  const comment = panel(page).locator('.fb-comments__item', { hasText: 'Looks good to me.' });

  await expect(comment.locator('.fb-comments__meta strong')).toHaveText(email.split('@')[0]);
  await expect(comment).not.toContainText('@');
});

test('list rows show the done circle, and the selection box only on hover or selection', async ({
  page,
}) => {
  await page.goto('/collections/tasks');

  const rows = page.locator('.collection-view--list tbody > tr');
  const first = rows.first();
  const second = rows.nth(1);
  const box = (row: typeof first) => row.locator('td.cell-_select .select-row');

  await expect(first.locator('td.cell-title .fb-done-check')).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(box(first)).toHaveCSS('opacity', '0');

  await first.hover();
  await expect(box(first)).toHaveCSS('opacity', '1');
  await expect(box(second)).toHaveCSS('opacity', '0');

  await box(first).locator('input').check();
  await page.mouse.move(0, 0);
  await expect(box(first)).toHaveCSS('opacity', '1');
  await expect(box(second)).toHaveCSS('opacity', '1');

  await box(first).locator('input').uncheck();
});
