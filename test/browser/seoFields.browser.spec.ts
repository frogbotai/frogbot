import { expect, test } from '@playwright/test';

let pageErrors: string[];

test.beforeEach(async ({ page }) => {
  pageErrors = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
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
