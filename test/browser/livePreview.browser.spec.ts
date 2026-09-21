import { expect, type Page, test } from '@playwright/test';

import { signIn, user } from './__helpers/signIn';

const viewport = { width: 1440, height: 900 };

let id: number | string | undefined;
let slug = '';
let anonymousPage: Page | undefined;

async function openPreview(page: Page) {
  const toggler = page.locator('#live-preview-toggler');

  if (!(await toggler.getAttribute('class'))?.includes('live-preview-toggler--active')) {
    await toggler.click();
  }

  await expect(toggler).toHaveClass(/live-preview-toggler--active/);
}

test.describe('live preview', () => {
  test.use({ viewport });

  test.beforeAll(async ({ request }) => {
    const response = await request.get('/api/users/init');

    expect(response.ok()).toBe(true);

    const { initialized } = await response.json();

    if (!initialized) {
      const registration = await request.post('/api/users/first-register', { data: user });

      expect(registration.ok()).toBe(true);
    }
  });

  test.beforeEach(async ({ page }) => {
    id = undefined;
    slug = '';

    await signIn(page);

    slug = `home-${Date.now()}`;

    const response = await page.request.post('/api/pages?draft=true', {
      data: { title: 'Home', slug, _status: 'draft' },
    });

    expect(response.ok()).toBe(true);

    const pageDocument = await response.json();
    id = pageDocument.doc?.id ?? pageDocument.id;

    await page.goto(`/collections/pages/${id}`);
  });

  test.afterEach(async ({ page }) => {
    await anonymousPage?.close();
    anonymousPage = undefined;

    if (id !== undefined) {
      const response = await page.request.delete(`/api/pages/${id}`);

      expect(response.ok()).toBe(true);
    }

    id = undefined;
    slug = '';
  });

  test('edit view shows the live preview toggle for a collection enabled at the root', async ({
    page,
  }) => {
    await expect(page.locator('#live-preview-toggler')).toBeVisible();
  });

  test('opening live preview loads the iframe at the configured URL', async ({ page }) => {
    await openPreview(page);

    const iframe = page.locator('#live-preview-iframe');

    await expect(iframe).toBeVisible();
    await expect.poll(() => iframe.getAttribute('src')).toMatch(new RegExp(`/pages/${slug}$`));
  });

  test('editing the title updates the preview without saving', async ({ page }) => {
    await openPreview(page);

    const title = page.frameLocator('#live-preview-iframe').locator('#page-title');

    await expect(title).toHaveText('Home', { timeout: 30_000 });
    await page.fill('#field-title', 'Home (Edited)');
    await expect(title).toHaveText('Home (Edited)', { timeout: 15_000 });
  });

  test('anonymous visitors cannot read the preview page directly', async ({ browser, baseURL }) => {
    anonymousPage = await browser.newPage();

    const response = await anonymousPage.goto(`${baseURL}/pages/${slug}`);

    expect(response?.status()).toBe(404);
    await expect(anonymousPage.locator('#page-title')).toHaveCount(0);
  });
});
