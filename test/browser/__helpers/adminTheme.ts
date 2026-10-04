import { expect, type Locator, type Page } from '@playwright/test';

export type AdminTheme = 'dark' | 'light';

export async function setAdminTheme(page: Page, theme: AdminTheme) {
  await page
    .context()
    .addCookies([{ name: 'frogbot-theme', value: theme, domain: 'localhost', path: '/' }]);
}

export async function openPostCreate(page: Page, theme: AdminTheme) {
  await setAdminTheme(page, theme);

  await page.goto('/collections/posts/create');
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

export async function readAdminColor(page: Page, token: string) {
  return page.evaluate((name) => {
    const sample = document.createElement('div');

    sample.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue(
      name,
    );
    document.body.append(sample);

    const color = getComputedStyle(sample).backgroundColor;

    sample.remove();

    return color;
  }, token);
}

export function readBackground(locator: Locator) {
  return locator.evaluate((element) => getComputedStyle(element).backgroundColor);
}

export async function openMenu(page: Page, prefix: string) {
  await page.getByTestId(`${prefix}-trigger`).first().click();

  const menu = page.getByTestId(prefix);

  await expect(menu).toBeVisible();

  return menu;
}

export async function expectBackground(locator: Locator, expected: string) {
  expect(expected).not.toBe('rgba(0, 0, 0, 0)');
  await expect.poll(() => readBackground(locator)).toBe(expected);
}
