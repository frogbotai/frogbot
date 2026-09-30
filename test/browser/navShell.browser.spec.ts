import { expect, type Locator, type Page, test } from '@playwright/test';

import { createMessage, deleteMessage, type SavedMessage } from './__helpers/messages';
import { collectionNavIcon, expandSidebar } from './__helpers/sidebar';
import { signIn } from './__helpers/signIn';

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

const drawnBounds = (icon: Locator) =>
  icon.evaluate((svg) => {
    const boxes = [...svg.children].map((child) => (child as SVGGraphicsElement).getBBox());
    const left = Math.min(...boxes.map((box) => box.x));
    const top = Math.min(...boxes.map((box) => box.y));
    const right = Math.max(...boxes.map((box) => box.x + box.width));
    const bottom = Math.max(...boxes.map((box) => box.y + box.height));

    return { centreX: (left + right) / 2, centreY: (top + bottom) / 2, width: right - left };
  });

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

  test('collections section links to the configured collections', async ({ page }) => {
    await signIn(page);
    await expandSidebar(page);

    await expect(
      page.locator('#frogbot-nav-section-collections').getByRole('link', { name: 'Users' }),
    ).toHaveAttribute('href', '/collections/users');
  });

  test('home page shows collection cards instead of chat', async ({ page }) => {
    await signIn(page);

    await expect(page.locator('#card-users .card__click')).toHaveAttribute(
      'href',
      '/collections/users',
    );
    await expect(page.locator('.fb-composer')).toHaveCount(0);
  });

  test('home page lists built-in collection cards under one Collections heading', async ({
    page,
  }) => {
    await signIn(page);

    await expect(page.locator('.collections__label')).toHaveText(['Collections']);
    await expect(page.locator('.collections__group #card-chats')).toHaveCount(1);
    await expect(page.locator('.collections__group #card-files')).toHaveCount(1);
  });

  test('default sidebar shows only the Collections section, with Chats and its icon', async ({
    page,
  }) => {
    await signIn(page);
    await expandSidebar(page);

    const collections = page.locator('#frogbot-nav-section-collections');
    const chats = collections.getByRole('link', { name: 'Chats' });

    await expect(chats).toHaveAttribute('href', '/collections/chats');
    await expect(chats.locator('svg')).toHaveCount(1);
    await expect(collections.locator('.frogbot-collections-section__group-label')).toHaveCount(0);
    await expect(shell(page).getByText('Collections', { exact: true })).toHaveCount(1);
    await expect(shell(page).getByRole('button', { name: 'New Chat' })).toHaveCount(0);
    await expect(page.locator('#frogbot-nav-section-recents')).toHaveCount(0);
  });

  test('default sidebar has no Messages link', async ({ page }) => {
    await signIn(page);
    await expandSidebar(page);

    const collections = page.locator('#frogbot-nav-section-collections');

    await expect(collections.getByRole('link', { name: 'Chats' })).toBeVisible();
    await expect(collections.getByRole('link', { name: 'Messages' })).toHaveCount(0);
  });

  test('home page has no Messages card', async ({ page }) => {
    await signIn(page);

    await expect(page.locator('#card-chats')).toHaveCount(1);
    await expect(page.locator('#card-messages')).toHaveCount(0);
  });

  test('Settings > Collections has no Messages card', async ({ page }) => {
    await signIn(page);

    await page.goto('/settings/collections');

    await expect(page.locator('#card-chats')).toHaveCount(1);
    await expect(page.locator('#card-messages')).toHaveCount(0);
  });

  test('messages list URL shows the admin not-found page', async ({ page }) => {
    await signIn(page);

    await page.goto('/collections/messages');

    await expect(page.locator('.not-found')).toBeVisible();
  });

  test('messages list URL redirects a signed-out visitor to login', async ({ page }) => {
    await page.goto('/collections/messages');

    await expect(page).toHaveURL(/\/login/);
  });

  test.describe('with a saved message', () => {
    let saved: SavedMessage;

    test.beforeEach(async ({ page }) => {
      await signIn(page);

      saved = await createMessage(page);
    });

    test.afterEach(async ({ page }) => {
      await deleteMessage(page, saved);
    });

    test('message document URL shows the admin not-found page', async ({ page }) => {
      await page.goto(`/collections/messages/${saved.messageId}`);

      await expect(page.locator('.not-found')).toBeVisible();
    });
  });

  test('chats create route opens the chat composer', async ({ page }) => {
    await signIn(page);

    await page.goto('/collections/chats/create');

    await expect(page.locator('.fb-composer textarea')).toBeVisible();
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
    await expect(page.locator('#frogbot-nav-section-collections')).toHaveCount(0);
    await expect(collectionNavIcon(page, 'chats')).toHaveCount(0);
    await noHorizontalOverflow(page);

    await page.click('button[aria-label="Open sidebar"]');
    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-open');
  });

  test('sidebar shows Chats as a centred bubble without a dot', async ({ page }) => {
    await signIn(page);
    await expandSidebar(page);

    const icon = collectionNavIcon(page, 'chats');

    await expect(icon).toHaveClass(/\blucide-bubble-chat-icon\b/);
    await expect(icon.locator('circle')).toHaveCount(0);

    const bounds = await drawnBounds(icon);

    expect(Math.abs(bounds.centreX - 12)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(bounds.centreY - 12)).toBeLessThanOrEqual(0.5);
    expect(bounds.width).toBeGreaterThanOrEqual(18);
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
