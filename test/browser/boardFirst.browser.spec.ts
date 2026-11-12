import { expect, type Page, test } from '@playwright/test';

import { boardFirstLinksSlug, boardFirstSlug } from './fixtures/question/shared';

let consoleErrors: string[];

const tabs = (page: Page) => page.getByRole('navigation', { name: 'Collection views' });

test.beforeEach(async ({ page }) => {
  consoleErrors = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(`${message.text()} ${message.location().url}`);
    }
  });

  page.on('pageerror', (error) => consoleErrors.push(error.message));

  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);

  for (const [title, status] of [
    ['Tidy the backlog', 'todo'],
    ['Ship the release', 'done'],
  ]) {
    const response = await page.request.post(`/api/${boardFirstSlug}`, {
      data: { status, title },
    });

    expect(response.ok()).toBe(true);
  }
});

test.afterEach(() => {
  expect(
    consoleErrors.filter(
      (message) => !/ERR_TUNNEL_CONNECTION_FAILED|\/favicon\.ico$/.test(message),
    ),
  ).toEqual([]);
});

test('opens on the board and offers the list on its own tab and address', async ({ page }) => {
  await page.goto(`/collections/${boardFirstSlug}`);

  await expect(page.locator('main.collection-view--board')).toBeVisible();
  await expect(page.locator('.frog-board__card .fb-card__title')).toHaveText([
    'Tidy the backlog',
    'Ship the release',
  ]);
  await expect(tabs(page).getByRole('link')).toHaveText(['Board', 'List']);
  await expect(tabs(page).getByRole('link', { name: 'Board' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await tabs(page).getByRole('link', { name: 'List' }).click();
  await page.waitForURL(new RegExp(`/collections/${boardFirstSlug}/list(\\?|$)`));

  await expect(page.locator('main.collection-view--list')).toBeVisible();
  await expect(tabs(page).getByRole('link', { name: 'List' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.locator('.table tbody tr')).toHaveCount(2);

  await page
    .locator('main.collection-view')
    .getByPlaceholder(/search/i)
    .first()
    .fill('Ship');

  await page.waitForURL(/search=Ship/);
  await expect(page.locator('.table tbody tr')).toHaveCount(1);
  await expect(page).toHaveURL(new RegExp(`/collections/${boardFirstSlug}/list\\?`));
});

test('returns to the tab the user last picked', async ({ page }) => {
  await page.goto(`/collections/${boardFirstSlug}`);
  await tabs(page).getByRole('link', { name: 'List' }).click();
  await page.waitForURL(new RegExp(`/collections/${boardFirstSlug}/list(\\?|$)`));
  await page.locator('main.collection-view--list').waitFor();

  await page.goto(`/collections/${boardFirstSlug}`);
  await page.waitForURL(new RegExp(`/collections/${boardFirstSlug}/list(\\?|$)`));
  await expect(page.locator('main.collection-view--list')).toBeVisible();

  await tabs(page).getByRole('link', { name: 'Board' }).click();
  await page.waitForURL(new RegExp(`/collections/${boardFirstSlug}(\\?|$)`));
  await page.locator('main.collection-view--board').waitFor();

  await page.goto(`/collections/${boardFirstSlug}`);
  await expect(page.locator('main.collection-view--board')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/collections/${boardFirstSlug}(\\?|$)`));
});

test('shows a list, not the board, in a relationship drawer', async ({ page }) => {
  await page.goto(`/collections/${boardFirstLinksSlug}/create`);

  await page.locator('#field-card').getByText('Select a value').click();

  const drawer = page.locator('.list-drawer');
  await expect(drawer.locator('.table tbody tr')).toHaveCount(2);
  await expect(drawer.locator('.frog-board')).toHaveCount(0);
});

test("keeps the board's grouping and sort out of the later list", async ({ page }) => {
  await page.goto(`/collections/${boardFirstSlug}?groupBy=status&sort=-title`);
  await page.locator('main.collection-view--board').waitFor();

  await page.goto(`/collections/${boardFirstSlug}/list`);

  await expect(page.locator('main.collection-view--list')).toBeVisible();
  await expect(page.locator('main.collection-view .fb-list-group')).toHaveCount(0);
  await expect(page.locator('.table tbody tr')).toHaveCount(2);
  await expect(page).not.toHaveURL(/groupBy=status|sort=-title/);
});
