import { expect, type Page, test } from '@playwright/test';

const created: Array<{ collection: string; id: number }> = [];

async function create(
  page: Page,
  collection: string,
  title: string,
  data: Record<string, unknown> = {},
) {
  const response = await page.request.post(`/api/${collection}`, { data: { title, ...data } });
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

test('a collection without useAsDone shows its title once, in the top row, wrapping', async ({
  page,
}) => {
  const long = `Entry ${'with a very long title that has to wrap '.repeat(3).trim()}`;
  const id = await create(page, 'journal', long);

  await page.goto(`/collections/journal?record=${id}`);
  const header = page.locator('.fb-record-panel-header');
  const title = header.locator('.fb-record-panel-title__input');
  await expect(title).toHaveValue(long);
  await expect(page.locator('.fb-record-panel-title__input')).toHaveCount(1);
  await expect(header.locator('.fb-record-panel-header__complete')).toHaveCount(0);

  const box = (await title.boundingBox())!;
  expect(box.height).toBeGreaterThan(50);
  const actions = (await header.locator('.fb-record-panel-header__actions').boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(actions.x);

  await expect(header.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
  await expect(header.getByRole('button', { name: 'Open full page' })).toHaveCSS('width', '32px');
});

test('the menu ends with delete in the danger colour', async ({ page }) => {
  const id = await create(page, 'tickets', 'Menu ticket', { summary: 'Has one' });

  await page.goto(`/collections/tickets?record=${id}`);
  await page.locator('.fb-record-panel-header__menu .popup-button').click();
  const items = page.locator('.fb-record-panel-header__menu .popup__content button');
  await expect(items).toHaveText(['Create New', 'Duplicate', 'Delete']);
  const deleteColor = await items.last().evaluate((node) => getComputedStyle(node).color);
  const createColor = await items.first().evaluate((node) => getComputedStyle(node).color);
  expect(deleteColor).not.toBe(createColor);
  await expect(
    page.locator('.fb-record-panel-header__menu .popup__content .popup-divider'),
  ).toHaveCount(1);
});

test('the footer stays pinned while the body scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 520 });
  const id = await create(page, 'tickets', 'Footer ticket', {
    notes: 'line\n'.repeat(60),
    summary: 'Pinned',
  });

  await page.goto(`/collections/tickets?record=${id}`);
  const footer = page.getByTestId('panel-footer');
  await expect(footer).toHaveAttribute('data-id', String(id));
  const before = (await footer.boundingBox())!;
  const body = page.locator('.fb-record-panel__body');
  const bodyBox = (await body.boundingBox())!;
  expect(before.y).toBeGreaterThanOrEqual(bodyBox.y + bodyBox.height);

  await body.evaluate((node) => node.scrollTo(0, node.scrollHeight));
  const after = (await footer.boundingBox())!;
  expect(after.y).toBe(before.y);
  await expect(footer.getByRole('textbox', { name: 'Comment' })).toBeVisible();

  await page.goto('/collections/journal');
  await expect(page.locator('.fb-record-panel__footer')).toHaveCount(0);
});

test('pill tabs switch, show activity, and count errors after Save', async ({ page }) => {
  const id = await create(page, 'tickets', 'Tabs ticket', { summary: 'First' });
  await page.request.patch(`/api/tickets/${id}`, { data: { status: 'open' } });

  await page.goto(`/collections/tickets?record=${id}`);
  const tabs = page.locator('.fb-record-panel .fb-pill-tabs');
  await expect(tabs.locator('.tabs-field__tab-button')).toHaveText(['Details', 'Activity']);
  const summary = page.locator('.fb-record-panel #field-summary');
  await expect(summary).toHaveValue('First');

  await tabs.getByRole('tab', { name: 'Activity' }).click();
  const activity = page.locator('.fb-record-panel .fb-activity');
  await expect(activity.locator('.fb-activity__entry')).toHaveCount(2);
  await expect(activity.locator('.fb-activity__entry').first()).toContainText('changed');
  await expect(activity.locator('.fb-activity__entry').last()).toContainText('created this');

  await tabs.getByRole('tab', { name: 'Details' }).click();
  await summary.fill('');
  await tabs.getByRole('tab', { name: 'Activity' }).click();
  await page.locator('.fb-record-panel-header__save').click();
  const details = tabs.getByRole('tab', { name: /Details/ });
  await expect(details).toHaveClass(/tabs-field__tab-button--has-error/);
  await expect(details.locator('.error-pill')).toHaveText('1');

  await page.goto(`/collections/tickets/${id}`);
  await page.locator('.fb-pill-tabs').getByRole('tab', { name: 'Activity' }).click();
  await expect(page.locator('.fb-activity .fb-activity__entry')).toHaveCount(2);
});
