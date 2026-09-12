import { expect, type Page, test } from '@playwright/test';

const user = { email: 'browser@example.com', password: 'browser-test-password' };
const desktop = { width: 1440, height: 900 };
const mobile = { width: 390, height: 844 };
const expandedRem = 17;
const collapsedWidth = 60;

const shell = (page: Page) => page.locator('.frogbot-nav-shell');
const backdrop = (page: Page) => page.locator('.frogbot-nav-backdrop');

const shellWidth = (page: Page) =>
  shell(page).evaluate((el) => Math.round(el.getBoundingClientRect().width));
const contentWidth = (page: Page) =>
  page
    .locator('.template-default__wrap')
    .evaluate((el) => Math.round(el.getBoundingClientRect().width));
const expandedWidth = (page: Page) =>
  page.evaluate(
    (rem) => Math.round(parseFloat(getComputedStyle(document.documentElement).fontSize) * rem),
    expandedRem,
  );

const noHorizontalOverflow = async (page: Page) => {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBe(innerWidth);
};

async function signIn(page: Page) {
  await page.goto('/');
  await page.waitForURL(/\/(create-first-user|login)/);
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', user.password);
  if (page.url().includes('create-first-user')) {
    await page.fill('input[name="confirm-password"]', user.password);
  }
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !/\/(create-first-user|login)/.test(url.pathname));
  await expect(shell(page)).toHaveAttribute('data-nav-hydrated', 'true');
}

async function expandSidebar(page: Page) {
  if ((await shell(page).getAttribute('data-nav-state')) === 'desktop-nav-closed') {
    await page.click('button[aria-label="Open sidebar"]');
    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-open');
  }
}

test.describe('nav shell on desktop', () => {
  test.use({ viewport: desktop });

  test('expanded sidebar shares the grid with full-width content', async ({ page }) => {
    await signIn(page);
    await expandSidebar(page);

    const sidebarWidth = await expandedWidth(page);
    await expect(shell(page)).toHaveCSS('opacity', '1');
    await expect.poll(() => shellWidth(page)).toBe(sidebarWidth);
    await expect.poll(() => contentWidth(page)).toBe(desktop.width - sidebarWidth);
    await expect(backdrop(page)).toHaveCount(0);
    await noHorizontalOverflow(page);
  });

  test('collapsed sidebar stays visible as an icon rail', async ({ page }) => {
    await signIn(page);
    await expandSidebar(page);

    await page.click('button[aria-label="Close sidebar"]');
    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-closed');
    await expect(shell(page)).toHaveCSS('opacity', '1');
    await expect.poll(() => shellWidth(page)).toBe(collapsedWidth);
    await expect.poll(() => contentWidth(page)).toBe(desktop.width - collapsedWidth);
    await expect(page.locator('.frogbot-admin-sidebar__logo')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Account' })).toBeVisible();
    await noHorizontalOverflow(page);

    await page.click('button[aria-label="Open sidebar"]');
    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-open');
  });
});

test.describe('nav shell on mobile', () => {
  test.use({ viewport: mobile });

  test('closed drawer leaves the content full width', async ({ page }) => {
    await signIn(page);

    await expect(shell(page)).toHaveAttribute('data-nav-state', 'mobile-nav-closed');
    await expect(shell(page)).toBeHidden();
    await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();
    await expect.poll(() => contentWidth(page)).toBe(mobile.width);
    await expect(backdrop(page)).toHaveCount(0);
    await noHorizontalOverflow(page);
  });

  test('open drawer overlays full-width content and closes from the backdrop', async ({ page }) => {
    await signIn(page);

    await page.click('button[aria-label="Open navigation"]');
    await expect(shell(page)).toHaveAttribute('data-nav-state', 'mobile-nav-open');
    await expect(shell(page)).toHaveCSS('position', 'fixed');
    await expect.poll(() => shellWidth(page)).toBe(await expandedWidth(page));
    await expect.poll(() => contentWidth(page)).toBe(mobile.width);
    await expect(backdrop(page)).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Open navigation' })).toHaveCount(0);
    await noHorizontalOverflow(page);

    await backdrop(page).click({ position: { x: mobile.width - 10, y: mobile.height / 2 } });
    await expect(shell(page)).toHaveAttribute('data-nav-state', 'mobile-nav-closed');
    await expect(backdrop(page)).toHaveCount(0);
  });

  test('open drawer closes with Escape', async ({ page }) => {
    await signIn(page);

    await page.click('button[aria-label="Open navigation"]');
    await expect(shell(page)).toHaveAttribute('data-nav-state', 'mobile-nav-open');
    await page.keyboard.press('Escape');
    await expect(shell(page)).toHaveAttribute('data-nav-state', 'mobile-nav-closed');
  });
});
