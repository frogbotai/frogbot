import { expect, type Page, test } from '@playwright/test';

const created: Array<{ collection: string; id: number }> = [];

async function create(page: Page, collection: string, title: string) {
  const response = await page.request.post(`/api/${collection}`, { data: { title } });
  expect(response.ok()).toBe(true);
  const { doc } = (await response.json()) as { doc: { id: number } };
  created.push({ collection, id: doc.id });

  return doc.id;
}

const panel = (page: Page) => page.locator('.fb-record-panel');
const recordParam = (page: Page) => new URL(page.url()).searchParams.get('record');

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test.afterEach(async ({ page }) => {
  for (const { collection, id } of created.splice(0)) {
    await page.request.delete(`/api/${collection}/${id}`);
  }
});

test('panel: false opens rows on the edit page and redirects ?record there', async ({ page }) => {
  const id = await create(page, 'notes', 'No panel note');

  await page.goto(`/collections/notes?record=${id}`);
  await expect(page).toHaveURL(new RegExp(`/collections/notes/${id}$`));

  await page.goto('/collections/notes');
  await page.locator('tbody tr', { hasText: 'No panel note' }).getByRole('link').first().click();
  await expect(page).toHaveURL(new RegExp(`/collections/notes/${id}$`));
  await expect(panel(page)).toHaveCount(0);
});

test('a drafts-autosave collection saves without a Save button', async ({ page }) => {
  const id = await create(page, 'journal', 'Autosaved entry');

  await page.goto(`/collections/journal?record=${id}`);
  const title = page.locator('.fb-record-panel-title__input');
  await expect(title).toHaveValue('Autosaved entry');
  await expect(page.locator('.fb-record-panel-header__save')).toHaveCount(0);

  await title.fill('Autosaved entry changed');

  await expect
    .poll(async () => {
      const response = await page.request.get(`/api/journal/${id}?draft=true`);

      return ((await response.json()) as { title?: string }).title;
    })
    .toBe('Autosaved entry changed');
});

test('renders the actions, beforeFields and afterFields slots in place', async ({ page }) => {
  const id = await create(page, 'journal', 'Slotted entry');

  await page.goto(`/collections/journal?record=${id}`);
  const header = page.locator('.fb-record-panel-header');
  const action = header.getByTestId('panel-action');
  await expect(action).toHaveAttribute('data-id', String(id));
  await expect(header.locator('.fb-record-panel-header__actions > *').first()).toHaveAttribute(
    'data-testid',
    'panel-action',
  );

  const before = page.getByTestId('panel-before');
  await expect(before).toHaveText('Before Slotted entry with payload');
  const order = await page
    .locator(
      '.fb-record-panel-title, [data-testid="panel-before"], .fb-record-panel-properties, [data-testid="panel-after"]',
    )
    .evaluateAll((nodes) =>
      nodes.map((node) => node.className || node.getAttribute('data-testid')),
    );

  expect(order).toEqual([
    'fb-record-panel-title',
    'panel-before',
    'fb-record-panel-properties',
    'panel-after',
  ]);
  await expect(page.locator('.fb-record-panel-properties .field-label')).toHaveText([/Mood/]);
  await expect(page.getByTestId('panel-after')).toHaveText('After journal');

  await action.getByRole('button', { name: 'Slot close' }).click();
  await expect(panel(page)).toHaveCount(0);
  expect(recordParam(page)).toBeNull();

  await page.goto(`/collections/journal?record=${id}`);
  await page.getByTestId('panel-action').getByRole('button', { name: 'Slot expand' }).click();
  await expect(page).toHaveURL(new RegExp(`/collections/journal/${id}$`));
});

test('replaces the header, or the whole panel', async ({ page }) => {
  const memo = await create(page, 'memos', 'Header memo');
  const card = await create(page, 'cards', 'Whole card');

  await page.goto(`/collections/memos?record=${memo}`);
  await expect(page.getByTestId('panel-header')).toContainText(`Memo ${memo}`);
  await expect(page.locator('.fb-record-panel-header')).toHaveCount(0);
  await expect(page.locator('.fb-record-panel-title__input')).toHaveValue('Header memo');
  await page.getByRole('button', { name: 'Header close' }).click();
  await expect(panel(page)).toHaveCount(0);

  await page.goto(`/collections/cards?record=${card}`);
  await expect(page.getByTestId('panel-whole')).toContainText(`Card ${card}: Whole card`);
  await expect(page.locator('.fb-record-panel .collection-edit')).toHaveCount(0);
  await page.getByRole('button', { name: 'Whole close' }).click();
  await expect(panel(page)).toHaveCount(0);

  await page.goto(`/collections/cards?record=${card}`);
  await page.getByRole('button', { name: 'Whole expand' }).click();
  await expect(page).toHaveURL(new RegExp(`/collections/cards/${card}$`));
});
