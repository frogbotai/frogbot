import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, type Page, test } from '@playwright/test';

import { prepareView, shootView } from './__helpers/viewShots';
import { timezoneId, todayDate } from './fixtures/crm/shared';

const shots = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'test-results',
  'projects-views',
);

const views = [
  { name: 'tasks-list', path: '/collections/tasks' },
  { name: 'tasks-board', path: '/collections/tasks/board' },
  { name: 'tasks-timeline', path: `/collections/tasks/timeline?date=${todayDate}`, bars: true },
  {
    name: 'tasks-timeline-day',
    path: `/collections/tasks/timeline?date=${todayDate}&scale=day`,
    bars: true,
  },
];

test.use({ timezoneId });

function watchErrors(page: Page) {
  const errors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));

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

    const files = await shootView(page, view.name, {
      path: shots,
      waitFor: view.bars ? '.frog-timeline__bar' : undefined,
    });

    expect(files).toHaveLength(4);

    for (const file of files) expect(existsSync(file)).toBe(true);

    expect(errors).toEqual([]);
  });
}

test('the tasks timeline shows every seeded task in its project band', async ({ page }) => {
  await prepareView(page);
  await page.goto(`/collections/tasks/timeline?date=${todayDate}&scale=week`);

  const labels = page.locator('.frog-timeline__band-label');

  await expect(labels).toHaveText(['Website relaunch', 'Mobile app beta', 'Support handbook']);

  const band = (name: string) =>
    page
      .locator('.frog-timeline__track')
      .nth(['Website relaunch', 'Mobile app beta', 'Support handbook'].indexOf(name));

  await expect(band('Website relaunch').locator('.frog-timeline__bar')).toHaveCount(5);
  await expect(band('Mobile app beta').locator('.frog-timeline__bar')).toHaveCount(4);
  await expect(band('Support handbook').locator('.frog-timeline__bar')).toHaveCount(3);

  const audit = page.locator('.frog-timeline__bar', { hasText: 'Run a performance audit' });
  const copy = page.locator('.frog-timeline__bar', { hasText: 'Write the homepage copy' });
  const dayWidth = await page
    .locator('.frog-timeline__track')
    .first()
    .evaluate((track) => track.getBoundingClientRect().width / 56);

  expect(Math.round(((await audit.boundingBox())?.width ?? 0) / dayWidth)).toBe(1);
  expect(Math.round(((await copy.boundingBox())?.width ?? 0) / dayWidth)).toBe(8);
});
