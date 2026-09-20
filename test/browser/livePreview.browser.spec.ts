import { expect, type Page, test } from '@playwright/test';

import { signIn } from './__helpers/signIn';

const viewport = { width: 1440, height: 900 };

let id: number | string | undefined;
let slug = '';

async function openPreview(page: Page) {
  const toggler = page.locator('#live-preview-toggler');

  if (!(await toggler.getAttribute('class'))?.includes('live-preview-toggler--active')) {
    await toggler.click();
  }

  await expect(toggler).toHaveClass(/live-preview-toggler--active/);
}

test.describe('live preview', () => {
  test.use({ viewport });

  test.beforeEach(async ({ page }) => {
    id = undefined;
    slug = '';

    await signIn(page);

    slug = `home-${Date.now()}`;

    const response = await page.request.post('/api/pages', {
      data: { title: 'Home', slug },
    });

    expect(response.ok()).toBe(true);

    const pageDocument = await response.json();
    id = pageDocument.doc?.id ?? pageDocument.id;

    await page.goto(`/collections/pages/${id}`);
  });

  test.afterEach(async ({ page }) => {
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
});
