import { expect, type Page } from '@playwright/test';

export const user = { email: 'browser@example.com', password: 'browser-test-password' };

export async function signIn(page: Page) {
  await page.goto('/');
  await page.waitForURL(/\/(create-first-user|login)/);
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', user.password);

  if (page.url().includes('create-first-user')) {
    await page.fill('input[name="confirm-password"]', user.password);
  }

  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !/\/(create-first-user|login)/.test(url.pathname));
  await expect(page.locator('.frogbot-nav-shell')).toHaveAttribute('data-nav-hydrated', 'true');
}
