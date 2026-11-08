import { expect, type Page, test } from '@playwright/test';

import { prepareView } from './__helpers/viewShots';
import { timezoneId } from './fixtures/crm/shared';

test.use({ timezoneId });

type Deal = { amount?: null | number; name: string; stage?: null | string };

const preferenceKeys = ['collection-deals', 'collection-deals-view-list'];

const usd = (value: number) =>
  new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' }).format(value);

const amountSummary = (page: Page) =>
  page.locator('tfoot.fb-list-summary').getByRole('button', { name: /^Amount:/ });

async function resetPreferences(page: Page) {
  for (const key of preferenceKeys) await page.request.delete(`/api/payload-preferences/${key}`);
}

async function sumAmounts(page: Page, keep: (deal: Deal) => boolean = () => true) {
  const response = await page.request.get('/api/deals?pagination=false&depth=0&draft=true');
  const { docs } = (await response.json()) as { docs: Deal[] };

  return docs.filter(keep).reduce((total, deal) => total + (deal.amount ?? 0), 0);
}

function countAggregates(page: Page) {
  const sent: string[] = [];

  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/deals/aggregate')) {
      sent.push(request.postData() ?? '');
    }
  });

  return sent;
}

test.beforeEach(async ({ page }) => {
  await prepareView(page);
  await resetPreferences(page);
});

test.afterEach(async ({ page }) => {
  await resetPreferences(page);
});

test('sums every page, follows filters and search, and keeps paging off the request', async ({
  page,
}) => {
  const sent = countAggregates(page);
  const total = await sumAmounts(page);

  await page.goto('/collections/deals?limit=10');
  await expect(page.locator('tbody tr')).toHaveCount(10);
  await expect(amountSummary(page)).toHaveText(`Sum${usd(total)}`);
  await expect(page.locator('tfoot.fb-list-summary')).toContainText('Count');

  const before = sent.length;

  await page.goto('/collections/deals?limit=10&page=2');
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await expect(amountSummary(page)).toHaveText(`Sum${usd(total)}`);
  expect(JSON.parse(sent[sent.length - 1])).toMatchObject({
    draft: true,
    values: { amount: { sum: 'amount' }, name: { count: true } },
  });

  const leads = await sumAmounts(page, (deal) => deal.stage === 'lead');

  await page.goto('/collections/deals?limit=10&where[stage][equals]=lead');
  await expect(amountSummary(page)).toHaveText(`Sum${usd(leads)}`);
  expect(sent.length).toBeGreaterThan(before);

  const inbound = await sumAmounts(page, (deal) => deal.name.includes('Inbound'));

  await page.goto('/collections/deals?limit=10&search=Inbound');
  await expect(amountSummary(page)).toHaveText(`Sum${usd(inbound)}`);
  expect(leads).not.toBe(total);
  expect(inbound).not.toBe(leads);
});

test('does not refetch when only the page changes', async ({ page }) => {
  await page.goto('/collections/deals?limit=10');
  await expect(amountSummary(page)).toContainText('$');

  const sent = countAggregates(page);
  const firstRow = await page.locator('tbody tr').first().innerText();

  await page.getByRole('button', { name: 'Next table page' }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator('tbody tr').first()).not.toHaveText(firstRow);
  await expect(amountSummary(page)).toContainText('$');

  expect(sent).toEqual([]);
});

test('keeps a chosen Average after reload, and Reset to default brings back the sum', async ({
  page,
}) => {
  const response = await page.request.get('/api/deals?pagination=false&depth=0&draft=true');
  const { docs } = (await response.json()) as { docs: Deal[] };
  const amounts = docs.flatMap((deal) => (typeof deal.amount === 'number' ? [deal.amount] : []));
  const average = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;

  await page.goto('/collections/deals');
  await amountSummary(page).click();

  await expect(page.getByRole('menuitem', { name: 'Earliest' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Average', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Average' })).toHaveCount(0);
  await expect(amountSummary(page)).toHaveText(`Average${usd(average)}`);

  await expect
    .poll(async () => {
      const stored = await page.request.get('/api/payload-preferences/collection-deals-view-list');

      return ((await stored.json()) as { value?: { summary?: unknown } }).value?.summary;
    })
    .toEqual({ amount: 'avg' });

  await page.reload();
  await expect(amountSummary(page)).toHaveText(`Average${usd(average)}`);

  await page.locator('#list-menu button, #list-menu').first().click();
  await page.getByRole('menuitem', { name: 'Reset to default' }).click();
  await expect(amountSummary(page)).toHaveText(/^Sum/);
});
