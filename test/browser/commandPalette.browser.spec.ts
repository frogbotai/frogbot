import { expect, type Page, test } from '@playwright/test';

import {
  hiddenSettings,
  projectsSlug,
  robotSettings,
  secretsSlug,
  tasksSlug,
} from './fixtures/question/shared';

const task = { title: 'Order toner', notes: 'Call the quokka supplier' };

async function create(page: Page, collection: string, data: object): Promise<number | string> {
  const response = await page.request.post(`/api/${collection}`, { data });

  expect(response.ok()).toBe(true);

  return (await response.json()).doc.id;
}

async function hotkeyModifier(page: Page): Promise<'Control' | 'Meta'> {
  return (await page.evaluate(() => navigator.userAgent)).includes('Mac OS X') ? 'Meta' : 'Control';
}

async function gotoTasks(page: Page) {
  await page.goto(`/collections/${tasksSlug}`);
  await expect(page.locator('.fb-nav-shell')).toHaveAttribute('data-nav-hydrated', 'true');
}

async function openPalette(page: Page) {
  await gotoTasks(page);
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

test.describe('SearchButton in beforeNavLinks', () => {
  const shell = (page: Page) => page.locator('.fb-nav-shell');
  const search = (page: Page) =>
    page.locator('.fb-app-sidebar').getByRole('button', {
      name: 'Search',
    });

  async function expectPaletteFromSearch(page: Page) {
    await search(page).click();

    const dialog = page.getByRole('dialog');

    await expect(dialog).toHaveCount(1);
    await expect(dialog.getByRole('combobox')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }

  test('opens the palette with the sidebar open, showing its label and hint', async ({ page }) => {
    await gotoTasks(page);

    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-open');
    await expect(search(page)).toContainText('Search');
    await expect(search(page).locator('.fb-shortcut')).toHaveText(/^(⌘|Ctrl) \+ K$/);

    await expectPaletteFromSearch(page);
  });

  test('opens the palette from the collapsed rail without expanding it', async ({ page }) => {
    await gotoTasks(page);
    await page.getByRole('button', { name: 'Close sidebar' }).click();
    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-closed');

    await search(page).hover();
    await expect(page.getByRole('tooltip')).toHaveText('Search');

    await expectPaletteFromSearch(page);
    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-closed');

    await page.locator('.fb-app-sidebar').click({ position: { x: 20, y: 400 } });
    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-open');
  });

  test('opens the palette from the phone drawer and closes the drawer', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoTasks(page);
    await page.locator('.app-header__sidebar-toggle').click();
    await expect(shell(page)).toHaveAttribute('data-nav-state', 'mobile-nav-open');

    await search(page).click();

    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(shell(page)).toHaveAttribute('data-nav-state', 'mobile-nav-closed');
  });
});

test('the palette lists the Settings pages the user can open, not refused ones', async ({
  page,
}) => {
  const dialog = await openPalette(page);
  const settings = dialog.getByRole('group', { name: 'Settings' });

  await expect(settings.getByRole('option', { name: robotSettings.label })).toBeVisible();
  await expect(dialog.getByRole('option', { name: hiddenSettings.label })).toHaveCount(0);

  await dialog.getByRole('combobox').fill(robotSettings.label);
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(new RegExp(`/settings/${robotSettings.path}$`));
});
