import { expect, type Page, test } from '@playwright/test';

import { setNavPreference } from './__helpers/sidebar';

const mobile = { width: 390, height: 844 };
const desktop = { width: 1280, height: 800 };

const shell = (page: Page) => page.locator('.fb-nav-shell');
const settingsNav = (page: Page) => page.locator('.frogbot-settings-nav');
const appSidebar = (page: Page) => page.locator('.fb-app-sidebar');

async function waitForShell(page: Page) {
  await expect(shell(page)).toHaveAttribute('data-nav-hydrated', 'true');
}

async function firstUserId(page: Page) {
  const response = await page.request.get('/api/users?limit=1&depth=0');

  expect(response.ok()).toBe(true);

  return (await response.json()).docs[0].id as number | string;
}

test.describe('Settings shell', () => {
  test.use({ viewport: desktop });

  for (const [path, active] of [
    ['/settings/collections', 'Collections'],
    ['/account', 'Account'],
    ['/collections/users', 'Users'],
  ] as const) {
    test(`${path} shows the Settings sidebar with ${active} active`, async ({ page }) => {
      await page.goto(path);
      await waitForShell(page);

      await expect(settingsNav(page)).toBeVisible();
      await expect(appSidebar(page)).toHaveCount(0);
      await expect(settingsNav(page).locator('[aria-current="page"]')).toHaveText(active);
    });
  }

  test('a user document keeps the Settings sidebar with Users active', async ({ page }) => {
    await page.goto(`/collections/users/${await firstUserId(page)}`);
    await waitForShell(page);

    await expect(appSidebar(page)).toHaveCount(0);
    await expect(settingsNav(page).locator('[aria-current="page"]')).toHaveText('Users');
  });

  test('Users is a Settings item between Collections and Account, and no card', async ({
    page,
  }) => {
    await page.goto('/settings/collections');
    await waitForShell(page);

    const links = settingsNav(page).getByRole('link');

    await expect(links).toHaveText(['Back to app', 'Collections', 'Users']);
    await expect(settingsNav(page).getByRole('button', { name: 'Account' })).toBeVisible();
    await expect(settingsNav(page).getByRole('link', { name: 'Users' })).toHaveAttribute(
      'href',
      '/collections/users',
    );
    await expect(page.locator('#card-users')).toHaveCount(0);
    await expect(page.locator('#card-chats')).toHaveCount(1);
  });

  test('the main sidebar leaves Users out, and an app collection keeps it', async ({ page }) => {
    await page.goto('/collections/chats');
    await waitForShell(page);

    await expect(appSidebar(page)).toBeVisible();
    await expect(shell(page).getByRole('link', { name: 'Users' })).toHaveCount(0);
    await expect(settingsNav(page)).toHaveCount(0);
  });

  test('a collapsed main sidebar stays collapsed after a Settings round trip', async ({ page }) => {
    await setNavPreference(page, false);
    await page.goto('/collections/chats');
    await waitForShell(page);

    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-closed');

    await page.goto('/settings/collections');
    await waitForShell(page);

    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-open');

    await settingsNav(page).getByRole('link', { name: 'Back to app' }).click();

    await expect(appSidebar(page)).toBeVisible();
    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-closed');

    await setNavPreference(page, true);
  });

  test('Account opens the account menu with Log out', async ({ page }) => {
    await page.goto('/account');
    await waitForShell(page);

    await settingsNav(page).getByRole('button', { name: 'Account' }).click();

    await expect(page.getByRole('menuitem', { name: 'Log out' })).toBeVisible();
  });

  test('Back to app returns to the main sidebar', async ({ page }) => {
    await page.goto('/collections/users');
    await waitForShell(page);

    await settingsNav(page).getByRole('link', { name: 'Back to app' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(appSidebar(page)).toBeVisible();
  });
});

test.describe('Settings shell on a phone', () => {
  test.use({ viewport: mobile });

  for (const path of ['/settings/collections', '/account', '/collections/users']) {
    test(`${path} opens and closes the Settings drawer, and opens the palette`, async ({
      page,
    }) => {
      await page.goto(path);
      await waitForShell(page);

      await expect(shell(page)).toHaveAttribute('data-nav-state', 'mobile-nav-closed');

      await page.locator('.app-header__sidebar-toggle').click();

      await expect(shell(page)).toHaveAttribute('data-nav-state', 'mobile-nav-open');
      await expect(settingsNav(page)).toBeVisible();

      await page.keyboard.press('Escape');

      await expect(shell(page)).toHaveAttribute('data-nav-state', 'mobile-nav-closed');

      await page.keyboard.press('ControlOrMeta+k');

      await expect(page.getByRole('dialog')).toHaveCount(1);

      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));

      expect(scrollWidth).toBe(innerWidth);
    });
  }
});
