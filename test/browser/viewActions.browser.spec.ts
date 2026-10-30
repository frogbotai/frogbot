import { expect, test } from '@playwright/test';

import { tasksSlug } from './fixtures/question/shared';

let consoleErrors: string[];

test.beforeEach(({ page }) => {
  consoleErrors = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  page.on('pageerror', (error) => consoleErrors.push(error.message));
});

test.afterEach(() => {
  expect(consoleErrors).toEqual([]);
});

test('renders board actions right-aligned at their own width above the view controls', async ({
  page,
}) => {
  await page.goto(`/collections/${tasksSlug}/board`);

  const row = page.locator('.collection-view-shell__actions');
  const button = row.getByRole('button', { name: 'Board action' });

  await expect(button).toBeVisible();

  const rowBox = (await row.boundingBox())!;
  const buttonBox = (await button.boundingBox())!;

  expect(buttonBox.width).toBeLessThan(rowBox.width / 2);
  expect(Math.abs(buttonBox.x + buttonBox.width - (rowBox.x + rowBox.width))).toBeLessThanOrEqual(
    1,
  );
  expect(
    await row.evaluate(
      (element) =>
        element.compareDocumentPosition(document.querySelector('.list-controls')!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ),
  ).toBeTruthy();
});

test.describe('task document page', () => {
  let id: number | string;

  test.beforeEach(async ({ page }) => {
    const response = await page.request.post(`/api/${tasksSlug}`, {
      data: { title: 'Description task' },
    });

    expect(response.ok()).toBe(true);
    id = ((await response.json()) as { doc: { id: number | string } }).doc.id;
  });

  test.afterEach(async ({ page }) => {
    await page.request.delete(`/api/${tasksSlug}/${id}`);
  });

  test('shows the collection description without the view tabs', async ({ page }) => {
    await page.goto(`/collections/${tasksSlug}/${id}`);

    await expect(page.getByText('Tasks for the team.')).toHaveCount(1);
    await expect(page.getByText('Tasks for the team.')).toBeVisible();
    await expect(page.locator('.view-switcher')).toHaveCount(0);
  });

  test('shows a tab whose condition reads req.frogbot and hides the one it rules out', async ({
    page,
  }) => {
    await page.goto(`/collections/${tasksSlug}/${id}`);

    await expect(page.locator('.doc-tabs').getByText('Notes')).toBeVisible();
    await expect(page.locator('.doc-tabs').getByText('Hidden')).toHaveCount(0);
  });
});

test('keeps the view tabs and description on the board view', async ({ page }) => {
  await page.goto(`/collections/${tasksSlug}/board`);

  await expect(page.locator('.view-switcher')).toBeVisible();
  await expect(page.getByText('Tasks for the team.')).toHaveCount(1);
});

test('renders the root header and dashboard slots', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('root-header-slot')).toBeAttached();
  await expect(page.getByText('Before the dashboard')).toBeVisible();
  await expect(page.getByText('After the dashboard')).toBeVisible();
});
