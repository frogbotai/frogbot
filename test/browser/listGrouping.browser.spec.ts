import { expect, type Page, test } from '@playwright/test';

import { forgetViewSetup } from './__helpers/viewSetup';
import { prepareView } from './__helpers/viewShots';
import { timezoneId } from './fixtures/crm/shared';

test.use({ timezoneId });

const stages = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];

const groups = (page: Page) => page.locator('main.collection-view .fb-list-group');

const group = (page: Page, label: string) =>
  groups(page).filter({ has: page.locator('.fb-list-group__heading', { hasText: label }) });

const count = (page: Page, label: string) => group(page, label).locator('.fb-list-group__count');

const rows = (page: Page, label: string) => group(page, label).locator('tbody > tr');

const setupKey = 'collection-deals-view-list';

const collapseSaved = (page: Page) =>
  page.waitForResponse(
    (response) =>
      response.url().includes(`/payload-preferences/${setupKey}`) &&
      response.request().method() === 'POST',
  );

async function savedSetup(page: Page) {
  const response = await page.request.get(`/api/payload-preferences/${setupKey}`);

  return ((await response.json()) as { value?: Record<string, unknown> }).value ?? {};
}

async function reset(page: Page) {
  await forgetViewSetup(page, 'deals');
  await page.request.delete('/api/payload-preferences/collection-deals');
}

async function total(page: Page, where: string) {
  const response = await page.request.get(`/api/deals?limit=1&depth=0&${where}`);

  return ((await response.json()) as { totalDocs: number }).totalDocs;
}

let errors: string[];
let created: number[];

test.beforeEach(async ({ page }) => {
  errors = [];
  created = [];

  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  page.on('pageerror', (error) => errors.push(error.message));

  await prepareView(page);
  await reset(page);
});

test.afterEach(async ({ page }) => {
  for (const id of created) await page.request.delete(`/api/deals/${id}`);

  await reset(page);
  expect(errors).toEqual([]);
});

test('opens grouped by the view groupBy, in option order, with true counts', async ({ page }) => {
  await page.goto('/collections/deals');

  await expect(page).toHaveURL(/groupBy=stage/);
  await expect(page.locator('#toggle-group-by')).toContainText('Stage');
  await expect(groups(page).locator('.fb-list-group__heading')).toHaveText(
    stages.map((stage) => new RegExp(`^${stage}`)),
  );

  for (const stage of ['Lead', 'Proposal']) {
    const value = stage.toLowerCase();

    await expect(count(page, stage)).toHaveText(
      String(await total(page, `where[stage][equals]=${value}`)),
    );
  }

  await expect(rows(page, 'Lead').first()).toBeVisible();
});

test('shows empty option groups with 0 under a filter', async ({ page }) => {
  await page.goto('/collections/deals?groupBy=stage&where[name][like]=Inbound');

  await expect(count(page, 'Lead')).toHaveText(
    String(await total(page, 'where[name][like]=Inbound')),
  );
  await expect(count(page, 'Qualified')).toHaveText('0');
  await expect(rows(page, 'Qualified')).toHaveCount(0);
  await expect(groups(page)).toHaveCount(stages.length);
});

test('keeps a collapsed group collapsed after a reload, and reset clears it', async ({ page }) => {
  await page.goto('/collections/deals');
  await expect(rows(page, 'Lead').first()).toBeVisible();

  const saved = collapseSaved(page);
  await group(page, 'Lead').getByRole('button', { name: 'Collapse Lead' }).click();
  await expect(rows(page, 'Lead')).toHaveCount(0);
  await expect(count(page, 'Lead')).not.toHaveText('0');

  await saved;
  await page.reload();

  await expect(group(page, 'Lead').getByRole('button', { name: 'Expand Lead' })).toBeVisible();
  await expect(rows(page, 'Lead')).toHaveCount(0);
  await expect(rows(page, 'Proposal').first()).toBeVisible();

  await group(page, 'Lead').getByRole('button', { name: 'Expand Lead' }).click();
  await expect(rows(page, 'Lead').first()).toBeVisible();

  await group(page, 'Lead').getByRole('button', { name: 'Collapse Lead' }).click();
  await page.locator('#list-menu button, #list-menu').first().click();
  await page.getByRole('menuitem', { name: 'Reset to default' }).click();

  await expect(rows(page, 'Lead').first()).toBeVisible();
});

test('collapsing a group after changing the sort keeps the new sort saved', async ({ page }) => {
  await page.goto('/collections/deals?groupBy=stage&sort=name');
  await expect(group(page, 'Lost')).toBeVisible();

  let saved = collapseSaved(page);
  await group(page, 'Lost').getByRole('button', { name: 'Collapse Lost' }).click();
  await saved;

  await page
    .getByRole('button', { name: /sort by name descending/i })
    .first()
    .click();

  await expect(page).toHaveURL(/sort=-name/);
  await expect.poll(async () => (await savedSetup(page)).sort).toBe('-name');

  saved = collapseSaved(page);
  await group(page, 'Won').getByRole('button', { name: 'Collapse Won' }).click();
  await saved;

  expect(await savedSetup(page)).toMatchObject({ sort: '-name' });

  await page.goto('/collections/deals');
  await expect(page).toHaveURL(/sort=-name/);
});

test('deleting the selected rows of one group leaves the other groups alone', async ({ page }) => {
  for (const [name, stage] of [
    ['Grouped delete lost 1', 'lost'],
    ['Grouped delete lost 2', 'lost'],
    ['Grouped delete lost 3', 'lost'],
    ['Grouped delete won 1', 'won'],
    ['Grouped delete won 2', 'won'],
  ]) {
    const response = await page.request.post('/api/deals', { data: { name, stage } });
    created.push(((await response.json()) as { doc: { id: number } }).doc.id);
  }

  await page.goto('/collections/deals?groupBy=stage&limit=2&where[name][like]=Grouped%20delete');

  const lost = group(page, 'Lost');
  await expect(lost.locator('.fb-list-group__count')).toHaveText('3');
  await lost.locator('thead input[type="checkbox"]').check();
  await expect(lost.locator('#select-all-across-pages')).toHaveCount(0);

  await lost.getByRole('button', { name: /^delete$/i }).click();
  await page.getByRole('button', { name: /^confirm$/i }).click();
  await expect(page.getByText(/Deleted 2 Deals successfully/)).toBeVisible();

  const named = 'where[name][like]=Grouped%20delete';

  expect(await total(page, `${named}&where[stage][equals]=lost`)).toBe(1);
  expect(await total(page, `${named}&where[stage][equals]=won`)).toBe(2);
});

test('pages one group without moving the others', async ({ page }) => {
  await page.goto('/collections/deals?groupBy=stage&limit=10');

  const lead = group(page, 'Lead');
  const first = await rows(page, 'Lead').first().getAttribute('data-id');
  const proposal = await rows(page, 'Proposal').first().getAttribute('data-id');

  await expect(rows(page, 'Lead')).toHaveCount(10);
  await lead.getByRole('button', { name: /next/i }).click();

  await expect(page).toHaveURL(/queryByGroup/);
  await expect(rows(page, 'Lead').first()).not.toHaveAttribute('data-id', first!);
  await expect(rows(page, 'Proposal').first()).toHaveAttribute('data-id', proposal!);
});

test('adds a deal in a group with the stage filled in', async ({ page }) => {
  await page.goto('/collections/deals');

  const before = Number(await count(page, 'Qualified').innerText());

  await group(page, 'Qualified').getByRole('button', { name: 'Add to Qualified' }).click();

  const drawer = page.locator('.drawer--is-open, dialog[open]').last();

  await expect(drawer.locator('#field-stage')).toContainText('Qualified');
  await drawer.locator('#field-name').fill('Grouped add deal');
  await drawer.getByRole('button', { name: 'Save' }).click();
  await expect(drawer).toBeHidden();

  await expect(count(page, 'Qualified')).toHaveText(String(before + 1));
  await expect(group(page, 'Qualified')).toContainText('Grouped add deal');

  const created = await page.request.get(
    '/api/deals?where[name][equals]=Grouped%20add%20deal&depth=0',
  );

  const { docs } = (await created.json()) as { docs: Array<{ id: number; stage: string }> };

  expect(docs.map((doc) => doc.stage)).toEqual(['qualified']);
  await page.request.delete(`/api/deals/${docs[0].id}`);
});

test('keeps a person choosing no grouping over the view default', async ({ page }) => {
  await page.goto('/collections/deals?groupBy=');
  await expect(groups(page)).toHaveCount(0);

  await page.goto('/collections/deals');
  await expect(page.locator('main.collection-view table').first()).toBeVisible();
  await expect(groups(page)).toHaveCount(0);
});

test('hides the Group control on the calendar', async ({ page }) => {
  await page.goto('/collections/tasks/calendar');
  await page.locator('main.collection-view .list-controls').waitFor();

  await expect(page.locator('main.collection-view .group-by-control')).toBeHidden();
});
