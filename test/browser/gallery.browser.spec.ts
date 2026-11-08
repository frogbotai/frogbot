import { expect, type Page, test } from '@playwright/test';

import { prepareView } from './__helpers/viewShots';
import { timezoneId } from './fixtures/crm/shared';

test.use({ timezoneId });

const card = (page: Page, title: string) =>
  page.locator('.collection-gallery__card', {
    has: page.locator('.fb-card__title', { hasText: new RegExp(`^${title}$`) }),
  });

async function resetPreferences(page: Page) {
  for (const key of [
    'frogbot:collection-view:companies',
    'frogbot:collection-view:media',
    'collection-companies-view-gallery',
    'collection-companies-view-board',
    'collection-media-view-gallery',
  ]) {
    await page.request.delete(`/api/payload-preferences/${key}`);
  }
}

let errors: string[];

test.beforeEach(async ({ page }) => {
  errors = [];

  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  page.on('pageerror', (error) => errors.push(error.message));

  await prepareView(page);
  await resetPreferences(page);
});

test.afterEach(async ({ page }) => {
  await resetPreferences(page);
  expect(errors).toEqual([]);
});

test("shows company logos uncropped with the gallery's default fields", async ({ page }) => {
  await page.goto('/collections/companies/gallery');

  await expect(page.locator('main.collection-view')).toHaveClass(/collection-view--gallery/);
  await expect(
    page.getByRole('navigation', { name: 'Collection views' }).getByRole('link', { name: 'Logos' }),
  ).toHaveAttribute('aria-current', 'page');

  const lumen = card(page, 'Lumen Labs');
  const image = lumen.locator('.fb-card__image img');

  await expect(image).toHaveAttribute('src', /\/api\/media\/file\//);
  await expect(image).toHaveCSS('object-fit', 'contain');
  await expect(lumen.locator('.fb-card__field-label')).toHaveText(['Industry', 'Owner']);

  const heights = await page
    .locator('.collection-gallery__card .fb-card__image')
    .evaluateAll((areas) => [...new Set(areas.map((area) => area.getBoundingClientRect().height))]);

  expect(heights).toHaveLength(1);
});

test("keeps the image area with Payload's document icon for a company with no logo", async ({
  page,
}) => {
  await page.goto('/collections/companies/gallery');

  const noLogo = card(page, 'No logo company');

  await expect(noLogo.locator('.fb-card__image svg')).toBeVisible();
  await expect(noLogo.locator('.fb-card__image img')).toHaveCount(0);
});

test('has no drag handles, and opens the document drawer from a card', async ({ page }) => {
  await page.goto('/collections/companies/gallery');

  const lumen = card(page, 'Lumen Labs');

  await expect(lumen).toBeVisible();
  await expect(page.locator('.frog-board__card')).toHaveCount(0);
  await expect(page.locator('.collection-gallery [aria-roledescription="draggable"]')).toHaveCount(
    0,
  );

  await lumen.locator('.fb-card__title').click();
  await expect(page.locator('.drawer__content input#field-name')).toHaveValue('Lumen Labs');
});

test('shows no images on the companies board, which turns them off', async ({ page }) => {
  await page.goto('/collections/companies/board');

  await expect(page.locator('.frog-board__card .fb-card__title').first()).toBeVisible();
  await expect(page.locator('.fb-card__image')).toHaveCount(0);
});

test('shows each media file with no image keys set', async ({ page }) => {
  const media = (await (await page.request.get('/api/media?limit=0&depth=0')).json()) as {
    totalDocs: number;
  };

  await page.goto('/collections/media/gallery');

  const images = page.locator('.collection-gallery__card .fb-card__image img');

  await expect(images).toHaveCount(media.totalDocs);
  await expect(images.first()).toHaveAttribute('src', /\/api\/media\/file\//);
  await expect(images.first()).toHaveCSS('object-fit', 'cover');
});

test('shows the empty state when the search matches nothing', async ({ page }) => {
  await page.goto('/collections/companies/gallery?search=zzz-no-such-company');

  await expect(page.locator('.no-results')).toBeVisible();
  await expect(page.locator('.collection-gallery__card')).toHaveCount(0);
});

test('pages through the cards with the page controls', async ({ page }) => {
  await page.goto('/collections/companies/gallery?limit=5');

  const titles = page.locator('.collection-gallery__card .fb-card__title');

  await expect(titles).toHaveCount(5);
  const first = await titles.allTextContents();

  await page.getByRole('button', { name: 'Next table page' }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(titles).toHaveCount(5);
  await expect(titles).not.toHaveText(first);
});

test('shows the empty state on a page past the last one', async ({ page }) => {
  await page.goto('/collections/companies/gallery?limit=5&page=999');

  await expect(page.locator('.no-results')).toBeVisible();
  await expect(page.locator('.collection-gallery__card')).toHaveCount(0);
});
