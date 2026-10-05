import { expect, type Locator, type Page, test } from '@playwright/test';

import { user } from './__helpers/signIn';
import { tasksSlug } from './fixtures/question/shared';

const day = '2026-01-15';

const task = { title: 'Order toner', status: 'backlog', dueAt: `${day}T12:00:00.000Z` };

const calendarPath = `/collections/${tasksSlug}/calendar?mode=month&date=${day}T00:00:00.000Z`;

const listPath = `/collections/${tasksSlug}?columns=${encodeURIComponent(
  JSON.stringify(['title', 'number', 'createdBy']),
)}`;

type ID = number | string;

async function createTask(page: Page): Promise<ID> {
  const response = await page.request.post(`/api/${tasksSlug}`, { data: task });

  expect(response.ok()).toBe(true);

  return (await response.json()).doc.id;
}

async function storedNumber(page: Page, id: ID): Promise<number> {
  const response = await page.request.get(`/api/${tasksSlug}/${id}?depth=0`);

  expect(response.ok()).toBe(true);

  return (await response.json()).number;
}

function fieldValue(scope: Locator, prefix: 'board' | 'calendar', label: string) {
  return scope
    .locator(`.collection-${prefix}__field`, {
      has: scope.page().locator(`.collection-${prefix}__field-label`, {
        hasText: new RegExp(`^${label}$`),
      }),
    })
    .locator(`.collection-${prefix}__field-value`);
}

test.beforeEach(async ({ page }) => {
  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
});

test.afterEach(async ({ page }) => {
  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
});

test('a task created in the admin shows its number and creator in the List', async ({ page }) => {
  await page.goto(`/collections/${tasksSlug}/create`);
  await page.locator('#field-title').fill(task.title);

  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === `/api/${tasksSlug}`,
  );

  await page.getByRole('button', { name: 'Save', exact: true }).click();

  const response = await created;

  expect(response.ok()).toBe(true);

  const id: ID = (await response.json()).doc.id;
  const number = await storedNumber(page, id);

  await page.goto(listPath);

  const row = page.locator('tr', {
    has: page.locator('td.cell-title', { hasText: new RegExp(`^${task.title}$`) }),
  });

  expect(Number.isSafeInteger(number)).toBe(true);
  await expect(row.locator('td.cell-number')).toHaveText(String(number));
  await expect(row.locator('td.cell-createdBy')).toHaveText(user.email);
});

test('a Board card and a Calendar event show the creator', async ({ page }) => {
  await createTask(page);
  await page.goto(`/collections/${tasksSlug}/board`);

  const card = page.locator('.frog-board__card', { hasText: task.title });

  await expect(fieldValue(card, 'board', 'Created By')).toHaveText(user.email);

  await page.goto(calendarPath);

  const event = page.locator('.frog-calendar__event', { hasText: task.title });

  await event.scrollIntoViewIfNeeded();
  await expect(fieldValue(event, 'calendar', 'Created By')).toHaveText(user.email);
});

test('the edit form shows the three fields read-only', async ({ page }) => {
  const id = await createTask(page);
  const number = await storedNumber(page, id);

  await page.goto(`/collections/${tasksSlug}/${id}`);

  const numberInput = page.locator('#field-number');

  await expect(numberInput).toHaveValue(String(number));
  await expect(numberInput).toBeDisabled();

  for (const name of ['createdBy', 'lastModifiedBy']) {
    const field = page.locator(`#field-${name}`);

    await expect(field).toHaveClass(/relationship--read-only/);
    await expect(field).toContainText(user.email);
    await expect(field.locator('input:not([disabled])')).toHaveCount(0);
  }
});
