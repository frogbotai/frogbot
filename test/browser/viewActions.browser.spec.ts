import { expect, type Locator, test } from '@playwright/test';

import { tasksSlug, timesheetsSlug } from './fixtures/question/shared';

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

const phone = { width: 390, height: 844 };

async function precedes(first: Locator, second: Locator) {
  const other = await second.elementHandle();

  return first.evaluate(
    (element, node) =>
      Boolean(node && element.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING),
    other,
  );
}

for (const { name, path, label } of [
  { name: 'a non-default board', path: `/collections/${tasksSlug}/board`, label: 'Board action' },
  { name: 'a default board', path: `/collections/${timesheetsSlug}`, label: 'Timesheet action' },
  { name: 'a default list', path: `/collections/${tasksSlug}`, label: 'List action' },
]) {
  test(`renders actions in the page header on ${name}`, async ({ page }) => {
    await page.goto(path);

    await expect(page.locator('.app-header').getByRole('button', { name: label })).toBeVisible();
    await expect(page.getByRole('button', { name: label })).toHaveCount(1);
    await expect(page.locator('.collection-view-shell__actions')).toHaveCount(0);
  });
}

test.describe('list toolbar', () => {
  let id: number | string;

  test.beforeEach(async ({ page }) => {
    const response = await page.request.post(`/api/${tasksSlug}`, {
      data: { title: 'Toolbar task' },
    });

    expect(response.ok()).toBe(true);
    id = ((await response.json()) as { doc: { id: number | string } }).doc.id;
  });

  test.afterEach(async ({ page }) => {
    await page.request.delete(`/api/${tasksSlug}/${id}`);
  });

  test('renders before Filters in the list controls', async ({ page }) => {
    await page.goto(`/collections/${tasksSlug}`);

    const tool = page.locator('.list-controls__actions').getByRole('button', { name: 'List tool' });

    await expect(tool).toBeVisible();
    expect(await precedes(tool, page.locator('#toggle-list-filters'))).toBe(true);
  });

  test('renders beside the row selection on a phone', async ({ page }) => {
    await page.setViewportSize(phone);
    await page.goto(`/collections/${tasksSlug}`);

    await expect(
      page
        .locator('.collection-list__list-selection-actions')
        .getByRole('button', { name: 'List tool' }),
    ).toBeVisible();
    await expect(page.locator('.list-controls__actions').getByText('List tool')).toHaveCount(0);
  });
});

test('keeps the URL filters on a default board', async ({ page }) => {
  await page.goto(`/collections/${timesheetsSlug}?where[title][equals]=Probe`);

  await expect(page.locator('#toggle-list-filters')).toHaveAttribute('aria-expanded', 'true');
  await expect
    .poll(() =>
      page
        .locator('.list-controls__where input')
        .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)),
    )
    .toContain('Probe');
});

test('renders the board toolbar before Filters', async ({ page }) => {
  await page.goto(`/collections/${tasksSlug}/board`);

  const tool = page.locator('.list-controls__actions').getByRole('button', { name: 'Board tool' });

  await expect(tool).toBeVisible();
  expect(await precedes(tool, page.locator('#toggle-list-filters'))).toBe(true);
  await expect(page.locator('.collection-view-shell__toolbar')).toHaveCount(0);
});

test('renders the board toolbar right-aligned under the controls on a phone', async ({ page }) => {
  await page.setViewportSize(phone);
  await page.goto(`/collections/${tasksSlug}/board`);

  const row = page.locator('.collection-view-shell__toolbar');
  const tool = row.getByRole('button', { name: 'Board tool' });

  await expect(tool).toBeVisible();
  await expect(page.locator('.list-controls__actions').getByText('Board tool')).toHaveCount(0);
  expect(await precedes(page.locator('.list-controls'), row)).toBe(true);

  const rowBox = (await row.boundingBox())!;
  const toolBox = (await tool.boundingBox())!;

  expect(toolBox.width).toBeLessThan(rowBox.width / 2);
  expect(Math.abs(toolBox.x + toolBox.width - (rowBox.x + rowBox.width))).toBeLessThanOrEqual(1);
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
