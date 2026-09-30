import { expect, type Page, test } from '@playwright/test';

const user = { email: 'plugin-seo@example.com', password: 'browser-test-password' };

async function signIn(page: Page) {
  await page.goto('/admin');
  await page.waitForURL(/\/(create-first-user|login)/);
  await page.waitForLoadState('networkidle');
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', user.password);

  if (page.url().includes('create-first-user')) {
    const response = await page.request.post('/api/users/first-register', { data: user });

    expect(response.ok()).toBe(true);
    await page.goto('/admin');

    return;
  }

  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !/\/(create-first-user|login)/.test(url.pathname));
}

let pageErrors: string[];

test.beforeEach(async ({ page }) => {
  pageErrors = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));

  await signIn(page);
});

test('auto-generates a hand-placed SEO title through the wrapper client', async ({ page }) => {
  await page.goto('/admin/collections/pages/create');
  await page.locator('#field-title').fill('Browser SEO page');
  await page.getByRole('button', { name: 'SEO', exact: true }).click();

  const generation = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/plugin-seo/generate-title') &&
      response.request().method() === 'POST',
  );

  await page.getByRole('button', { name: 'Auto-generate', exact: true }).click();

  const response = await generation;

  expect(response.status()).toBe(200);
  await expect(page.locator('#field-meta__title')).toHaveValue('pages: Browser SEO page');
  expect(pageErrors).toEqual([]);
});
