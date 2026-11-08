import { expect, type Page, test } from '@playwright/test';

import { prepareView } from './__helpers/viewShots';
import { timezoneId } from './fixtures/crm/shared';

test.use({ timezoneId });

type Doc = Record<string, unknown> & { id: number | string };

async function create(page: Page, collection: string, data: Record<string, unknown>) {
  const response = await page.request.post(`/api/${collection}`, { data });

  expect(response.ok()).toBe(true);

  return (await response.json()).doc as Doc;
}

async function stored(page: Page, collection: string, id: number | string) {
  const response = await page.request.get(`/api/${collection}/${id}?depth=0`);

  return (await response.json()) as Doc;
}

function row(page: Page, title: string) {
  return page.locator('tbody tr', { hasText: title });
}

function cell(page: Page, title: string, column: string) {
  return row(page, title).locator(`td.cell-${column}`);
}

test('smoke: edits a money cell with Enter', async ({ page }) => {
  const name = `Smoke ${Date.now()}`;
  const deal = await create(page, 'deals', { name, amount: 1000, stage: 'lead' });

  await prepareView(page);
  await page.goto(`/collections/deals?search=${encodeURIComponent(name)}&groupBy=`);

  const amount = cell(page, name, 'amount');

  await expect(amount).toHaveAttribute('data-cell-edit', 'amount');
  await amount.click();
  const input = amount.locator('.fb-cell-editor input');

  await expect(input).toBeFocused();
  await input.fill('2500');
  await input.press('Enter');

  await expect(amount.locator('.fb-cell-editor')).toHaveCount(0);
  await expect.poll(async () => (await stored(page, 'deals', deal.id)).amount).toBe(2500);
  await expect(amount).toContainText('2,500');
});
