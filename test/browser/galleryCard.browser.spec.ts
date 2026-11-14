import { expect, test } from '@playwright/test';

import { approvalsSlug } from './fixtures/question/shared';

test.beforeEach(async ({ page }) => {
  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
});

test("renders a gallery's custom Card with the document as row, between its slots", async ({
  page,
}) => {
  const created = await page.request.post(`/api/${approvalsSlug}`, {
    data: { approver: 'Ada', status: 'todo', title: 'Launch plan' },
  });

  expect(created.ok()).toBe(true);
  await page.goto(`/collections/${approvalsSlug}/gallery`);

  const grid = page.locator('.collection-gallery');
  const approval = grid.locator('.approval-card');

  await expect(approval).toHaveText('Launch plan approved by Ada');
  await expect(grid.locator('.fb-card__title')).toHaveCount(0);

  const before = (await page.locator('.before-cards').boundingBox())!;
  const gridBox = (await grid.boundingBox())!;
  const after = (await page.locator('.after-cards').boundingBox())!;

  expect(before.y).toBeLessThan(gridBox.y);
  expect(after.y).toBeGreaterThan(gridBox.y + gridBox.height - 1);
});
