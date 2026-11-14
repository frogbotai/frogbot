import { expect, type Locator, type Page, test } from '@playwright/test';

import { cellKindsSlug } from './fixtures/question/shared';

type Doc = Record<string, unknown> & { id: number | string };

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e6)}`;

async function create(page: Page, data: Record<string, unknown>) {
  const response = await page.request.post(`/api/${cellKindsSlug}`, { data });

  expect(response.ok()).toBe(true);

  return (await response.json()).doc as Doc;
}

async function storedColor(page: Page, id: number | string) {
  const response = await page.request.get(`/api/${cellKindsSlug}/${id}?depth=0`);

  return ((await response.json()) as Doc).color;
}

function colorCell(page: Page, title: string) {
  return page.locator('tbody tr', { hasText: title }).locator('td.cell-color');
}

function editor(target: Locator) {
  return target.locator('.fb-cell-editor');
}

async function save(page: Page, id: number | string) {
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      new URL(response.url()).pathname === `/api/${cellKindsSlug}/${id}`,
  );

  await page.getByRole('button', { name: 'Save', exact: true }).click();

  return saved;
}

test('the document view picks, types and checks a color', async ({ page }) => {
  const doc = await create(page, { title: `Picker ${stamp()}` });

  await page.goto(`/collections/${cellKindsSlug}/${doc.id}`);

  const field = page.locator('.color-field');
  const input = field.locator('input[type="text"]');
  const swatches = field.getByRole('group', { name: 'Color swatches' });

  await expect(swatches.getByRole('button')).toHaveCount(10);
  await swatches.getByRole('button', { name: '#22c55e' }).click();
  await expect(input).toHaveValue('#22c55e');
  await expect(swatches.getByRole('button', { name: '#22c55e' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect((await save(page, doc.id)).ok()).toBe(true);
  expect(await storedColor(page, doc.id)).toBe('#22c55e');

  await field.getByLabel('Pick a color for Color').fill('#123abc');
  await expect(input).toHaveValue('#123abc');
  await expect(field.locator('.color-field__picker .color-swatch')).toHaveCSS(
    'background-color',
    'rgb(18, 58, 188)',
  );
  expect((await save(page, doc.id)).ok()).toBe(true);
  expect(await storedColor(page, doc.id)).toBe('#123abc');

  await input.fill('blue');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(field).toHaveClass(/\berror\b/);
  await expect(field).toContainText('Enter a hex color such as #3b82f6.');
  expect(await storedColor(page, doc.id)).toBe('#123abc');
});

test('a list cell shows the swatch and edits in place with the picker', async ({ page }) => {
  const title = `Swatch ${stamp()}`;
  const doc = await create(page, { title, color: '#F0A' });

  await page.goto(`/collections/${cellKindsSlug}?search=${encodeURIComponent(title)}`);

  const target = colorCell(page, title);

  await expect(target).toContainText('#F0A');
  await expect(target.locator('.color-swatch')).toHaveCSS('background-color', 'rgb(255, 0, 170)');

  await target.click();
  await expect(editor(target).locator('input[type="text"]')).toBeFocused();
  await expect(editor(target).locator('.color-field__swatches')).toBeHidden();
  await editor(target).getByLabel('Pick a color for Color').fill('#3b82f6');
  await page.keyboard.press('Enter');
  await expect(editor(target)).toHaveCount(0);
  await expect.poll(() => storedColor(page, doc.id)).toBe('#3b82f6');
  await expect(target.locator('.color-swatch')).toHaveCSS('background-color', 'rgb(59, 130, 246)');
});
