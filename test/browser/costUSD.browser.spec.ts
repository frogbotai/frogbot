import { expect, test } from '@playwright/test';

import { signIn } from './__helpers/signIn';
import { apiKeysSlug, costKeyName, usageLogsSlug, usersSlug } from './fixtures/question/shared';

let seeded: {
  userId: number | string;
  apiKeyId: number | string;
  usageLogIds: { small: number | string; key: number | string };
};

test.beforeEach(async ({ page }) => {
  await signIn(page);

  const seededResponse = await page.request.post('/api/browser/costs');

  expect(seededResponse.ok()).toBe(true);

  seeded = await seededResponse.json();
});

test.afterEach(async ({ page }) => {
  expect((await page.request.delete('/api/browser/costs')).ok()).toBe(true);
});

test('Usage Logs heads the cost column "Cost (USD)" and shows dollars', async ({ page }) => {
  await page.goto(`/collections/${usageLogsSlug}?where[requestId][like]=browser-cost`);

  await expect(page.locator('th#heading-costUSD')).toHaveText('Cost (USD)');
  await expect(page.getByText('Cost U S D')).toHaveCount(0);

  const small = page.getByRole('row', { name: /browser\/cost-small/ });
  const key = page.getByRole('row', { name: /browser\/cost-key/ });

  await expect(small.locator('td.cell-costUSD')).toHaveText('$0.000173');
  await expect(key.locator('td.cell-costUSD')).toHaveText('$0.02');
});

test('a usage log shows its cost as read-only dollars', async ({ page }) => {
  await page.goto(`/collections/${usageLogsSlug}/${seeded.usageLogIds.small}`);

  await expect(page.locator('.field-type.number', { hasText: 'Cost (USD)' })).toContainText(
    '$0.000173',
  );
  await expect(page.locator('input[name="costUSD"]')).toHaveCount(0);
});

test('API Keys shows Total Cost (USD) at two decimals', async ({ page }) => {
  await page.goto(`/collections/${apiKeysSlug}`);

  await expect(page.locator('th#heading-totalCostUSD')).toHaveText('Total Cost (USD)');

  const row = page.getByRole('row', { name: new RegExp(costKeyName) });

  await expect(row.locator('td.cell-totalCostUSD')).toHaveText('$0.02');
});

test("a user's Monthly Spend shows dollars and Monthly Budget stays editable", async ({ page }) => {
  await page.goto(`/collections/${usersSlug}/${seeded.userId}`);

  await expect(
    page.locator('.field-type.number', { hasText: 'Monthly Spend (USD)' }),
  ).toContainText('$3.25');
  await expect(page.locator('input[name="spendThisPeriodUSD"]')).toHaveCount(0);

  const budget = page.locator('input[name="monthlyBudget"]');

  await expect(budget).toBeVisible();
  await expect(budget).toBeEditable();
});
