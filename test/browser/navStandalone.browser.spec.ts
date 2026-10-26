import path from 'node:path';

import { expect, type Page, test } from '@playwright/test';

import {
  buildWithoutPayload,
  fontsCss,
  renderGallery,
  standaloneStack,
  stylesheet,
} from './fixtures/ui-parity/build';

let js = '';
let css = '';

test.beforeAll(async () => {
  [js, css] = await Promise.all([
    buildWithoutPayload(path.join(import.meta.dirname, 'fixtures', 'ui-parity', 'nav-page.tsx')),
    stylesheet([...standaloneStack, fontsCss]),
  ]);
});

test.use({ viewport: { width: 1100, height: 700 } });

const shell = (page: Page) => page.locator('.fb-nav-shell');
const focused = (page: Page) =>
  page.evaluate(() => {
    const element = document.activeElement as HTMLElement;

    return element.getAttribute('aria-label') ?? element.textContent?.trim() ?? '';
  });

const open = async (page: Page) => {
  await renderGallery(page, { css, js, theme: 'light', admin: false });
  await expect(shell(page)).toHaveAttribute('data-nav-hydrated', 'true');
};

test('the sidebar renders and sizes itself with no Payload code or CSS', async ({ page }) => {
  await open(page);

  await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-open');
  await expect(shell(page)).toHaveCSS('width', '272px');
  await expect(page.locator('.fb-app-sidebar__label').first()).toHaveCSS('font-family', /^Inter/);

  await page.getByRole('button', { name: 'Close sidebar' }).click();

  await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-closed');
  await expect(shell(page)).toHaveCSS('width', '60px');
  await expect(page.locator('#saved')).toHaveText('[["nav",{"open":false}]]');
});

test('the open sidebar works from the keyboard', async ({ page }) => {
  await open(page);

  const order = [];

  for (let index = 0; index < 9; index += 1) {
    await page.keyboard.press('Tab');
    order.push(await focused(page));
  }

  expect(order).toEqual([
    'Home',
    'Close sidebar',
    'Chat',
    'Providers',
    'Recents',
    'Tree frogs',
    'Pond survey',
    'Account',
    'After the nav',
  ]);

  await page.getByRole('link', { name: 'Pond survey' }).press('Enter');

  await expect(page.locator('#path')).toHaveText('/chat/2');
  await expect(page.getByRole('link', { name: 'Pond survey' })).toBeFocused();
  await expect(page.getByRole('link', { name: 'Pond survey' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await page.getByRole('button', { name: 'Recents' }).press('Enter');

  await expect(page.getByRole('button', { name: 'Recents' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(page.getByRole('link', { name: 'Pond survey' })).toBeHidden();

  await page.getByRole('button', { name: 'Account' }).press('Enter');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');

  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Account' })).toBeFocused();
});

test('the collapsed rail opens from the keyboard and labels its icons on hover', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: 'Close sidebar' }).click();
  await page.mouse.move(800, 400);

  await page.getByRole('button', { name: 'Providers' }).hover();
  await expect(page.getByRole('tooltip')).toHaveText('Providers');
  await page.mouse.move(800, 400);
  await expect(page.getByRole('tooltip')).toHaveCount(0);

  await page.getByRole('button', { name: 'Open sidebar' }).press('Enter');

  await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-open');
});

test('below 768px the sidebar is a drawer that Escape closes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await open(page);

  await expect(shell(page)).toHaveAttribute('data-nav-state', 'mobile-nav-closed');
  await expect(shell(page)).toBeHidden();

  await page.getByRole('button', { name: 'Open navigation' }).press('Enter');

  await expect(shell(page)).toHaveAttribute('data-nav-state', 'mobile-nav-open');
  await expect(shell(page)).toHaveCSS('position', 'fixed');
  await expect(page.locator('.fb-nav-backdrop')).toHaveCount(1);

  await page.keyboard.press('Escape');

  await expect(shell(page)).toHaveAttribute('data-nav-state', 'mobile-nav-closed');
  await expect(page.locator('.fb-nav-backdrop')).toHaveCount(0);
});
