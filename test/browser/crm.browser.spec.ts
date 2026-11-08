import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, type Page, test } from '@playwright/test';

import { prepareView, shootView } from './__helpers/viewShots';
import { timezoneId, todayDate } from './fixtures/crm/shared';

const shots = path.join(path.dirname(fileURLToPath(import.meta.url)), 'test-results', 'crm-views');

const views = [
  { name: 'companies-list', path: '/collections/companies' },
  { name: 'companies-board', path: '/collections/companies/board' },
  { name: 'contacts-list', path: '/collections/contacts' },
  { name: 'deals-list', path: '/collections/deals' },
  { name: 'deals-board', path: '/collections/deals/board' },
  { name: 'activities-list', path: '/collections/activities' },
  { name: 'activities-calendar', path: `/collections/activities/calendar?date=${todayDate}` },
  { name: 'tasks-list', path: '/collections/tasks' },
  { name: 'tasks-board', path: '/collections/tasks/board' },
  { name: 'tasks-calendar', path: `/collections/tasks/calendar?date=${todayDate}` },
];

test.use({ timezoneId });

function watchErrors(page: Page) {
  const errors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));

  page.on('requestfailed', (request) => {
    if (request.failure()?.errorText !== 'net::ERR_ABORTED') {
      errors.push(`request: ${request.method()} ${request.url()} ${request.failure()?.errorText}`);
    }
  });

  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`response: ${response.status()} ${response.url()}`);
  });

  return errors;
}

for (const view of views) {
  test(`shoots the ${view.name} view with no errors`, async ({ page }) => {
    test.setTimeout(60_000);

    const errors = watchErrors(page);

    await prepareView(page);
    await page.goto(view.path);

    const files = await shootView(page, view.name, { path: shots });

    expect(files).toHaveLength(4);

    for (const file of files) expect(existsSync(file)).toBe(true);

    expect(errors).toEqual([]);
  });
}

test('shoots the tasks board and list with the record panel open, with no errors', async ({
  page,
}) => {
  test.setTimeout(120_000);

  const errors = watchErrors(page);

  await prepareView(page);
  const found = await page.request.get(
    `/api/tasks?where[title][equals]=${encodeURIComponent('Prepare the wholesale portal demo')}&limit=1`,
  );

  const [task] = ((await found.json()) as { docs: Array<{ id: number }> }).docs;

  for (const view of [
    { name: 'tasks-board-panel', path: `/collections/tasks/board?record=${task.id}` },
    { name: 'tasks-list-panel', path: `/collections/tasks?record=${task.id}` },
  ]) {
    await page.goto(view.path);

    const files = await shootView(page, view.name, {
      path: shots,
      waitFor: '.fb-record-panel-title__input',
    });

    expect(files).toHaveLength(4);
  }

  expect(errors).toEqual([]);
});
