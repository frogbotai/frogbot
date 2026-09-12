import { expect, test } from '@playwright/test';

const user = { email: 'browser@example.com', password: 'browser-test-password' };

test('loads the authenticated admin', async ({ page }) => {
  await page.goto('/');
  await page.waitForURL(/\/(create-first-user|login)/);
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', user.password);
  if (page.url().includes('create-first-user')) {
    await page.fill('input[name="confirm-password"]', user.password);
  }
  await page.click('button[type="submit"]');

  await expect(page).not.toHaveURL(/\/(create-first-user|login)/);
  await expect(page.locator('.template-default')).toBeVisible();
});
