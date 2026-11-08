import { expect, type Page, test } from '@playwright/test';

import { prepareView } from './__helpers/viewShots';
import { timezoneId, todayDate } from './fixtures/crm/shared';

test.use({ timezoneId });

const views = [
  { name: 'list', path: '/collections/tasks' },
  { name: 'board', path: '/collections/tasks/board' },
  { name: 'calendar', path: `/collections/tasks/calendar?date=${todayDate}` },
];

const tabs = (page: Page) => page.getByRole('navigation', { name: 'Collection views' });

async function frameBoxes(page: Page) {
  await page.locator('main.collection-view .list-controls').waitFor();

  const box = async (selector: string) => {
    const found = await page.locator(selector).first().boundingBox();

    return (
      found && { height: Math.round(found.height), x: Math.round(found.x), y: Math.round(found.y) }
    );
  };

  return {
    controls: await box('main.collection-view .list-controls'),
    search: await box('main.collection-view .list-controls__search-row'),
    tabs: await box('main.collection-view .fb-view-tabs'),
    title: await box('main.collection-view .list-header__title'),
  };
}

async function resetPreferences(page: Page) {
  for (const key of [
    'frogbot:collection-view:tasks',
    'collection-tasks',
    'collection-tasks-view-list',
    'collection-tasks-view-board',
    'collection-tasks-view-calendar',
  ]) {
    await page.request.delete(`/api/payload-preferences/${key}`);
  }
}

test.beforeEach(async ({ page }) => {
  await prepareView(page);
  await resetPreferences(page);
});

test.afterEach(async ({ page }) => {
  await resetPreferences(page);
});

test('renders list, board and calendar in one frame with the same header and toolbar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  const boxes = [];

  for (const view of views) {
    await page.goto(view.path);

    await expect(page.locator('main.collection-view')).toHaveCount(1);
    await expect(page.locator('main.collection-view')).toHaveClass(
      new RegExp(`collection-view--${view.name}`),
    );
    await expect(page.locator('.layout-toggle')).toHaveCount(0);
    await expect(page.locator('.default-list-view-tabs')).toHaveCount(0);
    await expect(page.locator('.view-controls')).toHaveCount(1);
    await expect(page.locator('#create-new-doc')).toBeVisible();

    boxes.push(await frameBoxes(page));
  }

  expect(boxes[1]).toEqual(boxes[0]);
  expect(boxes[2]).toEqual(boxes[0]);
});

test('shows one tab per view with its icon, and marks the open one', async ({ page }) => {
  await page.goto('/collections/tasks/board');

  const links = tabs(page).getByRole('link');

  await expect(links).toHaveText(['List', 'Board', 'Calendar']);
  await expect(tabs(page).getByRole('link', { name: 'Board' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(tabs(page).locator('[aria-current="page"]')).toHaveCount(1);

  for (const link of await links.all()) await expect(link.locator('svg')).toHaveCount(1);
});

test('links each tab to its route without a view param, and remembers the last tab', async ({
  page,
}) => {
  await page.goto('/collections/tasks?where[title][like]=Quill');

  await expect(tabs(page).getByRole('link', { name: 'Board' })).toHaveAttribute(
    'href',
    /\/collections\/tasks\/board$/,
  );

  await tabs(page).getByRole('link', { name: 'Board' }).click();
  await page.waitForURL(/\/collections\/tasks\/board$/);
  await page.locator('.collection-board').waitFor();

  await page.goto('/collections/tasks');
  await page.waitForURL(/\/collections\/tasks\/board$/);

  await tabs(page).getByRole('link', { name: 'List' }).click();
  await page.waitForURL(/\/collections\/tasks(\?|$)/);
  await page.goto('/collections/tasks');

  await expect(page.locator('main.collection-view--list')).toBeVisible();
});

test('turns the tabs into one menu on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/collections/tasks/board');

  await expect(tabs(page).getByRole('link')).toHaveCount(0);

  await tabs(page).getByRole('button').first().click();

  const items = page.getByRole('menuitem');

  await expect(items).toHaveText(['List', 'Board', 'Calendar']);
  await items.filter({ hasText: 'Calendar' }).click();
  await page.waitForURL(/\/collections\/tasks\/calendar/);
});

test("saves each view's columns and filters per user, and resets them to the config", async ({
  page,
}) => {
  const columns = encodeURIComponent(JSON.stringify(['title', 'status']));

  await page.goto(`/collections/tasks?columns=${columns}`);
  await expect(page.locator('#heading-priority')).toHaveCount(0);

  await page.goto('/collections/tasks/board?where[priority][equals]=high');
  await page.locator('.collection-board').waitFor();

  await page.goto('/collections/tasks');
  await expect(page.locator('#heading-status')).toBeVisible();
  await expect(page.locator('#heading-priority')).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get('where')).toBeNull();

  await page.goto('/collections/tasks/board');
  await expect(page.locator('#toggle-list-filters')).toHaveClass(/btn--selected|selected/);
  await expect(page.locator('.collection-board')).not.toContainText('Low');

  await page.goto('/collections/tasks');
  await page.locator('#list-menu button, #list-menu').first().click();
  await page.getByRole('menuitem', { name: 'Reset to default' }).click();

  await expect(page.locator('#heading-priority')).toBeVisible();

  await page.goto('/collections/tasks');
  await expect(page.locator('#heading-priority')).toBeVisible();
});

test('shows the empty state on every view, and keeps the calendar grid under it', async ({
  page,
}) => {
  const nothing = 'where[title][equals]=No%20such%20task';

  await page.goto(`/collections/tasks?${nothing}`);
  await expect(page.locator('main.collection-view .no-results')).toBeVisible();

  await page.goto(`/collections/tasks/board?${nothing}`);
  await expect(page.locator('main.collection-view .no-results')).toBeVisible();
  await expect(page.locator('.collection-board')).toHaveCount(0);

  await page.goto(`/collections/tasks/calendar?date=${todayDate}&${nothing}`);
  await expect(page.locator('main.collection-view .no-results')).toBeVisible();
  await expect(page.locator('.frog-calendar')).toBeVisible();
});

const card = (page: Page, title: string) =>
  page.locator('.frog-board__card').filter({ has: page.getByText(title, { exact: true }) });

test('shows done records in the shared done style on the board, list and calendar', async ({
  page,
}) => {
  await page.goto('/collections/tasks/board');

  const done = card(page, 'Completed while todo');

  await expect(done).toHaveClass(/fb-record--done/);
  await expect(done.getByRole('button', { name: 'Completed' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(card(page, 'Prepare the wholesale portal demo')).not.toHaveClass(/fb-record--done/);

  await page.goto('/collections/tasks?sort=title&limit=100');

  const row = page.locator('tbody tr').filter({ hasText: 'Completed while todo' });

  await expect(row).toHaveAttribute('data-done', '');
  await expect(row.locator('td.cell--linked a')).toHaveCSS('text-decoration-line', 'line-through');
  await expect(
    page.locator('tbody tr').filter({ hasText: 'Prepare the wholesale portal demo' }),
  ).not.toHaveAttribute('data-done', '');

  await page.goto(`/collections/tasks/calendar?date=${todayDate}&mode=month`);

  await expect(
    page.locator('.fb-record--done').filter({ hasText: 'Completed while todo' }),
  ).toBeVisible();
});

test("toggles done from a board card's check circle with an ordinary update", async ({ page }) => {
  await page.goto('/collections/tasks/board');

  const target = card(page, 'Prepare the wholesale portal demo');
  const check = target.getByRole('button', { name: 'Mark complete' });

  await check.click();
  await expect(target).toHaveClass(/fb-record--done/);
  await expect(target.getByRole('button', { name: 'Completed' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.fb-record-panel')).toHaveCount(0);

  await page.reload();
  await expect(card(page, 'Prepare the wholesale portal demo')).toHaveClass(/fb-record--done/);

  await card(page, 'Prepare the wholesale portal demo')
    .getByRole('button', { name: 'Completed' })
    .click();

  await expect(card(page, 'Prepare the wholesale portal demo')).not.toHaveClass(/fb-record--done/);
});

test('marks the record open in the panel as selected, and clears it on close', async ({ page }) => {
  await page.goto('/collections/tasks/board');

  const target = card(page, 'Draft the Tidewater proposal');

  await target.getByText('Draft the Tidewater proposal', { exact: true }).click();
  await expect(target).toHaveClass(/fb-record--selected/);
  await expect(page.locator('.fb-record--selected')).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(target).not.toHaveClass(/fb-record--selected/);

  await page.goto(`/collections/tasks/calendar?date=${todayDate}&mode=month`);

  const event = page.locator('.fb-record').filter({ hasText: 'Draft the Tidewater proposal' });

  await event.click();
  await expect(event).toHaveClass(/fb-record--selected/);

  await page.keyboard.press('Escape');
  await expect(event).not.toHaveClass(/fb-record--selected/);
});

test('the board still renders with a filter on a field that does not exist', async ({ page }) => {
  const response = await page.goto('/collections/tasks/board?where[nonexistentField][equals]=x');

  expect(response?.status()).toBeLessThan(500);
  await expect(page.locator('main.collection-view')).toBeVisible();
});

test('a broken filter opened once does not lock the user out of the plain board', async ({
  page,
}) => {
  await page.goto('/collections/tasks/board?where[nonexistentField][equals]=x');
  const response = await page.goto('/collections/tasks/board');

  expect(response?.status()).toBeLessThan(500);
  await expect(page.locator('main.collection-view')).toBeVisible();
});

test('a done row keeps the done style when the done column is hidden', async ({ page }) => {
  const columns = encodeURIComponent(JSON.stringify(['title', 'status']));
  await page.goto(`/collections/tasks?sort=title&limit=100&columns=${columns}`);

  const row = page.locator('tbody tr').filter({ hasText: 'Completed while todo' });

  await expect(row).toHaveAttribute('data-done', '');
  await expect(
    page.locator('tbody tr').filter({ hasText: 'Prepare the wholesale portal demo' }),
  ).not.toHaveAttribute('data-done', '');
});
