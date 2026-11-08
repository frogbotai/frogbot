import { expect, type Page, test } from '@playwright/test';

import { prepareView } from './__helpers/viewShots';
import { la, timezoneId, todayDate } from './fixtures/crm/shared';

test.use({ timezoneId });

type Task = { id: number; title: string };

const prefix = 'Panel spec';
const filter = `where[title][like]=${encodeURIComponent(prefix)}`;
const board = `/collections/tasks/board?${filter}`;
const list = `/collections/tasks?${filter}`;
const created: number[] = [];

async function createTask(page: Page, title: string, data: Record<string, unknown> = {}) {
  const response = await page.request.post('/api/tasks', {
    data: { status: 'todo', title: `${prefix} ${title}`, ...data },
  });

  expect(response.ok()).toBe(true);
  const { doc } = (await response.json()) as { doc: Task };
  created.push(doc.id);

  return doc;
}

const panel = (page: Page) => page.locator('.fb-record-panel');
const panelTitle = (page: Page) => page.locator('.fb-record-panel-title__input');
const card = (page: Page, task: Task) => page.locator('.frog-board__card', { hasText: task.title });
const recordParam = (page: Page) => new URL(page.url()).searchParams.get('record');

async function openOnBoard(page: Page, task: Task) {
  await card(page, task).click();
  await expect(panelTitle(page)).toHaveValue(task.title);
}

test.beforeEach(async ({ page }) => {
  await prepareView(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.request.delete('/api/payload-preferences/collection-tasks-panel');
});

test.afterEach(async ({ page }) => {
  for (const id of created.splice(0)) await page.request.delete(`/api/tasks/${id}`);

  await page.request.delete('/api/payload-preferences/collection-tasks-panel');
});

test('opens a board card beside the view, switches records and closes', async ({ page }) => {
  const a = await createTask(page, 'switch A');
  const b = await createTask(page, 'switch B');
  await page.goto(board);

  await openOnBoard(page, a);
  expect(recordParam(page)).toBe(String(a.id));
  await expect(card(page, a)).toHaveClass(/fb-record--selected/);
  await expect(page.locator('main.collection-view')).toHaveClass(/collection-view--panel-open/);

  await openOnBoard(page, b);
  expect(recordParam(page)).toBe(String(b.id));
  await expect(card(page, b)).toHaveClass(/fb-record--selected/);
  await expect(card(page, a)).not.toHaveClass(/fb-record--selected/);
  await expect(panel(page)).toHaveCount(1);

  await page.locator('main.collection-view .list-header__title').click();
  await expect(panel(page)).toHaveCount(0);
  expect(recordParam(page)).toBeNull();

  await openOnBoard(page, a);
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  expect(recordParam(page)).toBeNull();
});

test('opens list rows and calendar events in the panel, and Cmd-click opens a tab', async ({
  page,
  context,
}) => {
  const a = await createTask(page, 'list A', { dueDate: la(0, 12) });
  const b = await createTask(page, 'list B', { dueDate: la(1, 12) });
  await page.goto(list);

  await page.locator('tbody tr', { hasText: a.title }).getByRole('link').first().click();
  await expect(panelTitle(page)).toHaveValue(a.title);
  expect(new URL(page.url()).pathname).toBe('/collections/tasks');
  expect(recordParam(page)).toBe(String(a.id));
  await expect(page.locator('tbody tr', { hasText: a.title })).toHaveAttribute('data-selected', '');

  await page.locator('tbody tr', { hasText: b.title }).locator('td').last().click();
  await expect(panelTitle(page)).toHaveValue(b.title);

  const tab = context.waitForEvent('page');

  await page
    .locator('tbody tr', { hasText: a.title })
    .getByRole('link')
    .first()
    .click({ modifiers: ['ControlOrMeta'] });

  const opened = await tab;
  await opened.waitForLoadState();
  expect(new URL(opened.url()).pathname).toBe(`/collections/tasks/${a.id}`);
  await opened.close();
  await expect(panelTitle(page)).toHaveValue(b.title);

  await page.goto(`/collections/tasks/calendar?date=${todayDate}&${filter}`);
  await page.locator('.frog-calendar__event', { hasText: a.title }).first().click();
  await expect(panelTitle(page)).toHaveValue(a.title);
  expect(recordParam(page)).toBe(String(a.id));
});

test('reopens from a pasted link and a reload, and Back skips the records', async ({ page }) => {
  const a = await createTask(page, 'link A');
  const b = await createTask(page, 'link B');

  await page.goto('/');
  await page.goto(`${board}&record=${a.id}`);
  await expect(panelTitle(page)).toHaveValue(a.title);

  await page.reload();
  await expect(panelTitle(page)).toHaveValue(a.title);

  await openOnBoard(page, b);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
});

test('saves with Save and Cmd-S, and the card changes only when it saves', async ({ page }) => {
  const a = await createTask(page, 'save A');
  await page.goto(board);
  await openOnBoard(page, a);

  await panelTitle(page).fill(`${a.title} edited`);
  await expect(card(page, a)).toContainText(a.title);
  await expect(page.locator('.frog-board__card', { hasText: 'edited' })).toHaveCount(0);

  await page.locator('.fb-record-panel-header__save').click();
  await expect(page.locator('.frog-board__card', { hasText: `${a.title} edited` })).toHaveCount(1);

  await panelTitle(page).fill(`${a.title} again`);
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('.frog-board__card', { hasText: `${a.title} again` })).toHaveCount(1);

  await page.reload();
  await expect(panelTitle(page)).toHaveValue(`${a.title} again`);
});

test('asks before switching away from unsaved edits', async ({ page }) => {
  const a = await createTask(page, 'guard A');
  const b = await createTask(page, 'guard B');
  await page.goto(board);
  await openOnBoard(page, a);

  await panelTitle(page).fill(`${a.title} unsaved`);
  await card(page, b).click();
  const modal = page.locator('#fb-record-panel-leave');
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: 'Stay on this page' }).click();
  await expect(modal).toBeHidden();
  await expect(panelTitle(page)).toHaveValue(`${a.title} unsaved`);

  await page.keyboard.press('Escape');
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: 'Leave anyway' }).click();
  await expect(panel(page)).toHaveCount(0);

  await openOnBoard(page, a);
  await panelTitle(page).fill(`${a.title} unsaved`);
  await card(page, b).click();
  await modal.getByRole('button', { name: 'Leave anyway' }).click();
  await expect(panelTitle(page)).toHaveValue(b.title);
  await panelTitle(page).fill(`${b.title} unsaved`);
  await page.locator('.fb-record-panel-header__menu .popup-button').click();
  await page.locator('#action-panel-duplicate').click();
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: 'Stay on this page' }).click();
  await expect(modal).toBeHidden();
  await expect(panelTitle(page)).toHaveValue(`${b.title} unsaved`);
  expect(recordParam(page)).toBe(String(b.id));
});

test('lays out the title, the properties in order once, then the rest', async ({ page }) => {
  const a = await createTask(page, 'layout A');
  await page.goto(board);
  await openOnBoard(page, a);

  await expect(page.locator('.fb-record-panel-properties .field-label')).toHaveText([
    /Status/,
    /Priority/,
    /Due Date/,
    /Assignee/,
    /Deal/,
    /Contact/,
  ]);

  for (const label of ['Title', 'Status', 'Priority', 'Due Date', 'Assignee', 'Deal', 'Contact']) {
    await expect(
      panel(page).locator('.field-label', { hasText: new RegExp(`^${label}`) }),
    ).toHaveCount(label === 'Title' ? 0 : 1);
  }

  await expect(panel(page).locator('.field-label', { hasText: /^Notes/ })).toHaveCount(1);
});

test('marks a record complete, and the header pins after scrolling', async ({ page }) => {
  const a = await createTask(page, 'done A');
  await page.setViewportSize({ width: 1440, height: 480 });
  await page.goto(board);
  await openOnBoard(page, a);

  const complete = page.locator('.fb-record-panel-header__complete');
  await complete.click();
  await expect(complete).toHaveAttribute('aria-pressed', 'true');
  await expect(card(page, a)).toHaveClass(/fb-record--done/);
  const saved = await page.request.get(`/api/tasks/${a.id}`);
  expect(((await saved.json()) as { completed: boolean }).completed).toBe(true);

  await page.locator('.fb-record-panel__body').evaluate((body) => body.scrollTo(0, 120));
  const header = page.locator('.fb-record-panel-header');
  await expect(header).toHaveClass(/fb-record-panel-header--compact/);
  await expect(header.locator('.fb-record-panel-header__title')).toHaveText(a.title);
  const box = await header.boundingBox();
  const body = await page.locator('.fb-record-panel__body').boundingBox();
  expect(Math.round(box!.y)).toBe(Math.round(body!.y));
});

test('copies a link, opens the full page, duplicates and deletes', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const a = await createTask(page, 'actions A');
  await page.goto(board);
  await openOnBoard(page, a);

  await page.getByRole('button', { name: 'Copy link' }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(copied).searchParams.get('record')).toBe(String(a.id));

  await page.locator('.fb-record-panel-header__menu .popup-button').click();
  await page.locator('#action-panel-duplicate').click();
  await expect.poll(() => recordParam(page)).not.toBe(String(a.id));
  const copyId = Number(recordParam(page));
  created.push(copyId);
  await expect(card(page, a)).toHaveCount(2);

  await page.locator('.fb-record-panel-header__menu .popup-button').click();
  await page.locator('#action-panel-delete').click();

  await page
    .locator('#fb-record-panel-delete-tasks')
    .getByRole('button', { name: 'Delete' })
    .click();

  await expect(panel(page)).toHaveCount(0);
  await expect(card(page, a)).toHaveCount(1);
  expect((await page.request.get(`/api/tasks/${copyId}`)).status()).toBe(404);

  await openOnBoard(page, a);
  await page.getByRole('button', { name: 'Open full page' }).click();
  await expect(page).toHaveURL(new RegExp(`/collections/tasks/${a.id}$`));
});

test('resizes between 400 and 960 px and remembers the width', async ({ page }) => {
  const a = await createTask(page, 'resize A');
  await page.goto(board);
  await openOnBoard(page, a);
  await expect(panel(page)).toHaveCSS('width', '560px');

  const handle = page.locator('.fb-record-panel__resize');
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x - 800, box.y + 200, { steps: 8 });
  await page.mouse.up();
  await expect(panel(page)).toHaveCSS('width', '960px');

  await page.reload();
  await expect(panelTitle(page)).toHaveValue(a.title);
  await expect(panel(page)).toHaveCSS('width', '960px');
});

test('covers the view below 768 px with no sideways scroll', async ({ page }) => {
  const a = await createTask(page, 'narrow A');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${board}&record=${a.id}`);
  await expect(panelTitle(page)).toHaveValue(a.title);

  const box = (await panel(page).boundingBox())!;
  expect(box).toMatchObject({ width: 390, x: 0, y: 0 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('drops a record that does not exist with a not-found toast', async ({ page }) => {
  await page.goto(`${board}&record=999999`);
  await expect(page.locator('.payload-toast-container')).toContainText('999999');
  await expect(panel(page)).toHaveCount(0);
  await expect.poll(() => recordParam(page)).toBeNull();
});

test('the panel create form switches to the record it saved', async ({ page }) => {
  const seed = await createTask(page, 'create seed');
  await page.goto(board);
  await openOnBoard(page, seed);

  await page.locator('.fb-record-panel-header__menu button').first().click();
  await page.locator('#action-panel-create').click();
  await expect(panelTitle(page)).toHaveValue('');
  await panelTitle(page).fill(`${prefix} created`);
  await page.locator('.fb-record-panel-header__save').click();

  await expect(page.locator('.frog-board__card', { hasText: `${prefix} created` })).toHaveCount(1);
  const found = await page.request.get(`/api/tasks?${filter}&limit=50`);
  const docs = ((await found.json()) as { docs: Task[] }).docs;
  created.push(...docs.filter((doc) => doc.title === `${prefix} created`).map((doc) => doc.id));
  await expect.poll(() => recordParam(page), { timeout: 10_000 }).not.toBeNull();
});
