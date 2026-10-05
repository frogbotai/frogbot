import { expect, type Locator, type Page, test } from '@playwright/test';

import { projectsSlug, tagsSlug, tasksSlug } from './fixtures/question/shared';

const day = '2026-01-15';

const calendarPath = `/collections/${tasksSlug}/calendar?mode=month&date=${day}T00:00:00.000Z`;

const titles = { apollo: 'Ship Apollo', zephyr: 'Plan Zephyr', loose: 'Loose task' };

async function create(page: Page, collection: string, data: object): Promise<number | string> {
  const response = await page.request.post(`/api/${collection}`, { data });

  expect(response.ok()).toBe(true);

  return (await response.json()).doc.id;
}

async function expectApollo(scope: Locator, field: string) {
  const fieldWith = (label: string) => scope.locator(field, { hasText: label });

  await expect(fieldWith('Project Budget')).toContainText('$12.50');
  await expect(fieldWith('Project Status').locator('.fb-option-pill--green')).toHaveText('Active');
}

test.beforeEach(async ({ page }) => {
  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);

  const apollo = await create(page, projectsSlug, {
    name: 'Apollo',
    budget: 12.5,
    status: 'active',
  });
  const zephyr = await create(page, projectsSlug, { name: 'Zephyr', budget: 0, status: 'paused' });
  const urgent = await create(page, tagsSlug, { name: 'urgent' });
  const backend = await create(page, tagsSlug, { name: 'backend' });

  await create(page, tasksSlug, {
    title: titles.apollo,
    project: apollo,
    tags: [urgent, backend],
    dueAt: `${day}T12:00:00.000Z`,
  });
  await create(page, tasksSlug, {
    title: titles.zephyr,
    project: zephyr,
    dueAt: `${day}T15:00:00.000Z`,
  });
  await create(page, tasksSlug, { title: titles.loose });
});

test.afterEach(async ({ page }) => {
  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
});

test('the tasks List shows virtual path fields like their source', async ({ page }) => {
  await page.goto(`/collections/${tasksSlug}`);

  const row = (title: string) => page.getByRole('row', { name: new RegExp(title) });
  const apollo = row(titles.apollo);

  await expect(apollo.locator('td.cell-projectBudget')).toHaveText('$12.50');
  await expect(apollo.locator('td.cell-projectStatus .fb-option-pill--green')).toHaveText('Active');
  await expect(apollo.locator('td.cell-tagNames')).toHaveText('urgent, backend');
  await expect(apollo.locator('td.cell-tagNames')).not.toContainText('[');

  await expect(row(titles.zephyr).locator('td.cell-projectBudget')).toHaveText('$0.00');
  await expect(row(titles.loose).locator('td.cell-projectBudget')).toHaveText('');
});

test('a Board card shows virtual path fields like their source', async ({ page }) => {
  await page.goto(`/collections/${tasksSlug}/board`);

  const card = page.locator('.frog-board__card', { hasText: titles.apollo });

  await expectApollo(card, '.collection-board__field');
  await expect(card.locator('.collection-board__field', { hasText: 'Tag Names' })).toContainText(
    'urgent, backend',
  );

  const loose = page.locator('.frog-board__card', { hasText: titles.loose });

  await expect(loose.locator('.collection-board__title')).toHaveText(titles.loose);
});

test('a Calendar event shows virtual path fields like their source', async ({ page }) => {
  await page.goto(calendarPath);

  const event = page.locator('.frog-calendar__event', { hasText: titles.apollo });

  await expectApollo(event, '.collection-calendar__field');
});

test('the tasks List shows 50 tasks with five tags each', async ({ page }) => {
  const names = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];
  const tags: (number | string)[] = [];

  for (const name of names) tags.push(await create(page, tagsSlug, { name }));

  for (let index = 1; index <= 50; index++) {
    await create(page, tasksSlug, { title: `Bulk task ${index}`, tags });
  }

  await page.goto(`/collections/${tasksSlug}?limit=100`);

  const bulk = page.getByRole('row', { name: /Bulk task/ });

  await expect(bulk).toHaveCount(50);
  await expect(bulk.locator('td.cell-tagNames', { hasText: names.join(', ') })).toHaveCount(50);
});
