import { expect, type Page } from '@playwright/test';

export const user = { email: 'browser@example.com', password: 'browser-test-password' };

const authPage = /\/(create-first-user|login)/;

async function waitForHydratedForm(page: Page) {
  await page.waitForFunction(() => {
    const form = document.querySelector('form');

    return !!form && Object.keys(form).some((key) => key.startsWith('__reactProps$'));
  });
}

async function submitAuthForm(page: Page) {
  await page.goto('/');
  await page.locator('input[name="email"], .frogbot-nav-shell').first().waitFor();

  if (!authPage.test(new URL(page.url()).pathname)) return;

  await waitForHydratedForm(page);
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', user.password);

  if (page.url().includes('create-first-user')) {
    await page.fill('input[name="confirm-password"]', user.password);
  }

  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !authPage.test(url.pathname), { timeout: 10_000 });
}

export async function signIn(page: Page) {
  await expect(() => submitAuthForm(page)).toPass({ timeout: 90_000 });

  await expect(page.locator('.frogbot-nav-shell')).toHaveAttribute('data-nav-hydrated', 'true');
}
