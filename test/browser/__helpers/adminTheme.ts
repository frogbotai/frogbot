import { expect, type Locator, type Page } from '@playwright/test';

export type AdminTheme = 'dark' | 'light';

const user = { email: 'custom-field@example.com', password: 'browser-test-password' };

export async function signIn(page: Page) {
  await page.goto('/');
  await page.waitForURL(/\/(create-first-user|login)/);
  await page.waitForLoadState('networkidle');
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', user.password);

  if (page.url().includes('create-first-user')) {
    const response = await page.request.post('/api/users/first-register', { data: user });

    expect(response.ok()).toBe(true);
    await page.goto('/');

    return;
  }

  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !/\/(create-first-user|login)/.test(url.pathname));
}

export async function openPostCreate(page: Page, theme: AdminTheme) {
  await page
    .context()
    .addCookies([{ name: 'frogbot-theme', value: theme, domain: 'localhost', path: '/' }]);

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
