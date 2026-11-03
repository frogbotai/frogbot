import { expect, type Page, test } from '@playwright/test';

import { projectsSlug, secretsSlug, tasksSlug } from './fixtures/question/shared';

const task = { title: 'Order toner', notes: 'Call the quokka supplier' };

async function create(page: Page, collection: string, data: object): Promise<number | string> {
  const response = await page.request.post(`/api/${collection}`, { data });

  expect(response.ok()).toBe(true);

  return (await response.json()).doc.id;
}

async function hotkeyModifier(page: Page): Promise<'Control' | 'Meta'> {
  return (await page.evaluate(() => navigator.userAgent)).includes('Mac OS X') ? 'Meta' : 'Control';
}

async function openPalette(page: Page) {
  await page.goto(`/collections/${tasksSlug}`);
  await expect(page.locator('.fb-nav-shell')).toHaveAttribute('data-nav-hydrated', 'true');
  await page.keyboard.press(`${await hotkeyModifier(page)}+k`);

  const dialog = page.getByRole('dialog');

  await expect(dialog).toHaveCount(1);

  return dialog;
}

let taskId: number | string;
let secretRequests: string[];

test.beforeEach(async ({ page }) => {
  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);

  taskId = await create(page, tasksSlug, task);
  await create(page, projectsSlug, { name: 'Acme' });

  secretRequests = [];

  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith(`/api/${secretsSlug}`)) {
      secretRequests.push(request.url());
    }
  });
});

test.afterEach(async ({ page }) => {
  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
});

test("Cmd+K opens FrogBot's palette in place of Payload's, and Esc closes it", async ({ page }) => {
  const dialog = await openPalette(page);

  await expect(dialog.getByRole('combobox')).toBeFocused();
  await expect(page.locator('.cmd-palette')).toBeHidden();

  await page.keyboard.press('Escape');

  await expect(dialog).toHaveCount(0);
});

test('a word in an indexed field lists the record, and Enter opens it', async ({ page }) => {
  const dialog = await openPalette(page);

  await dialog.getByRole('combobox').fill('quokka');

  const record = dialog.getByRole('group', { name: 'Tasks' }).getByRole('option', {
    name: task.title,
  });

  await expect(record).toHaveAttribute('aria-selected', 'true');
  await expect(dialog.getByRole('group', { name: 'Secrets' })).toHaveCount(0);

  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(new RegExp(`/collections/${tasksSlug}/${taskId}$`));
  await expect(dialog).toHaveCount(0);
  expect(secretRequests).toEqual([]);
});

test('part of a title finds the record in a collection with no index', async ({ page }) => {
  const dialog = await openPalette(page);

  await dialog.getByRole('combobox').fill('acm');

  await expect(
    dialog.getByRole('group', { name: 'Projects' }).getByRole('option', { name: 'Acme' }),
  ).toBeVisible();
  await expect(dialog.getByRole('group', { name: 'Secrets' })).toHaveCount(0);
  expect(secretRequests).toEqual([]);
});

test('Cmd+Enter on a collection row opens its create page', async ({ page }) => {
  const dialog = await openPalette(page);

  await dialog.getByRole('combobox').fill('Projects');

  await expect(dialog.getByRole('option', { name: 'Projects', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await page.keyboard.press(`${await hotkeyModifier(page)}+Enter`);

  await expect(page).toHaveURL(new RegExp(`/collections/${projectsSlug}/create$`));
});
