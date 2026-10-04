import { type APIRequestContext, expect, type Page } from '@playwright/test';

export type SignInOptions = { adminRoute?: string; timeout?: number };

export const user = { email: 'browser@example.com', password: 'browser-test-password' };

async function waitForHydratedForm(page: Page) {
  await page.waitForFunction(() => {
    const form = document.querySelector('form');

    return !!form && Object.keys(form).some((key) => key.startsWith('__reactProps$'));
  });
}

async function submitLoginForm(page: Page, adminRoute: string) {
  await page.goto(`${adminRoute}/login`);
  await page.locator('input[name="email"], .frogbot-nav-shell').first().waitFor();

  if (!new URL(page.url()).pathname.endsWith('/login')) return;

  await waitForHydratedForm(page);
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 10_000 });
}

export async function registerFirstUser(request: APIRequestContext) {
  const response = await request.get('/api/users/init');

  expect(response.ok()).toBe(true);

  const { initialized } = await response.json();

  if (initialized) return;

  const registration = await request.post('/api/users/first-register', { data: user });

  expect(registration.ok()).toBe(true);
}

export async function signIn(
  page: Page,
  { adminRoute = '', timeout = 20_000 }: SignInOptions = {},
) {
  await expect(() => submitLoginForm(page, adminRoute)).toPass({ timeout });

  await expect(page.locator('.frogbot-nav-shell')).toHaveAttribute('data-nav-hydrated', 'true');
}
