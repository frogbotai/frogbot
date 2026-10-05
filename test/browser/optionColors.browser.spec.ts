import { expect, type Locator, test } from '@playwright/test';

import { type AdminTheme, setAdminTheme } from './__helpers/adminTheme';
import { colorDifference, contrast } from './__helpers/color';
import { labelOptions, tasksSlug } from './fixtures/question/shared';

const labels = labelOptions.map(({ value }) => value);

const shipped = {
  title: 'Shipped',
  status: 'done',
  labels,
  dueAt: '2026-01-15T12:00:00.000Z',
};

const queued = { title: 'Queued', status: 'backlog' };

const loose = { title: 'Loose' };

const columns = encodeURIComponent(JSON.stringify(['status', 'labels', 'title']));

const listPath = `/collections/${tasksSlug}?columns=${columns}`;

let shippedId: number | string;

async function expectPills(scope: Locator) {
  const pills = scope.locator('.fb-option-pill');

  await expect(pills).toHaveText(labelOptions.map(({ label }) => label));

  for (const [index, { color }] of labelOptions.entries()) {
    await expect(pills.nth(index)).toHaveClass(
      new RegExp(`(^|\\s)fb-option-pill--${color}(\\s|$)`),
    );
  }
}

function readPillColors(scope: Locator) {
  return scope.locator('.fb-option-pill').evaluateAll((pills) =>
    pills.map((pill) => ({
      text: getComputedStyle(pill).color,
      background: getComputedStyle(pill).backgroundColor,
    })),
  );
}

test.beforeEach(async ({ page }) => {
  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);

  for (const data of [shipped, queued, loose]) {
    const response = await page.request.post(`/api/${tasksSlug}`, { data });

    expect(response.ok()).toBe(true);

    if (data === shipped) shippedId = (await response.json()).doc.id;
  }
});

test.afterEach(async ({ page }) => {
  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
});

test('the List link around a coloured status keeps its classes and opens the document', async ({
  page,
}) => {
  await page.goto(listPath);

  const link = page.getByRole('row', { name: /Shipped/ }).locator('td.cell-status a');

  await expect(link).toHaveClass(/(^|\s)selected--done(\s|$)/);
  await expect(link.locator('.fb-option-pill--green')).toHaveText('Done');
  expect(await link.getAttribute('href')).toMatch(
    new RegExp(`/collections/${tasksSlug}/${shippedId}$`),
  );

  await link.click();

  await expect(page).toHaveURL(new RegExp(`/collections/${tasksSlug}/${shippedId}$`));
});

test('the List shows a pill per stored value and gray for an uncoloured option', async ({
  page,
}) => {
  await page.goto(listPath);

  await expectPills(page.getByRole('row', { name: /Shipped/ }).locator('td.cell-labels'));

  const queuedStatus = page
    .getByRole('row', { name: /Queued/ })
    .locator('td.cell-status .fb-option-pill');

  await expect(queuedStatus).toHaveText('Backlog');
  await expect(queuedStatus).toHaveClass(/(^|\s)fb-option-pill--gray(\s|$)/);
});

test('Board column headers and cards show the option colours', async ({ page }) => {
  await page.goto(`/collections/${tasksSlug}/board`);

  const header = (label: string) => page.locator('.frog-board__column-header', { hasText: label });

  await expect(header('Done').locator('.fb-option-pill--green')).toHaveText('Done');
  await expect(header('Done').locator('.frog-board__column-count')).toHaveText('1');
  await expect(header('Backlog').locator('.fb-option-pill--gray')).toHaveText('Backlog');
  await expect(header('Uncategorized').locator('strong')).toHaveText('Uncategorized');
  await expect(header('Uncategorized').locator('.fb-option-pill')).toHaveCount(0);

  const card = page.locator('.frog-board__card', { hasText: shipped.title });

  await expectPills(card.locator('.collection-board__field', { hasText: 'Labels' }));
});

test('a Calendar event shows the coloured status', async ({ page }) => {
  await page.goto(`/collections/${tasksSlug}/calendar?mode=month&date=2026-01-15T00:00:00.000Z`);

  const event = page.locator('.frog-calendar__event', { hasText: shipped.title });

  await expect(event.locator('.fb-option-pill--green')).toHaveText('Done');
});

for (const theme of ['light', 'dark'] satisfies AdminTheme[]) {
  test(`every pill is readable and blue, cyan and teal differ in the ${theme} theme`, async ({
    page,
  }, testInfo) => {
    await setAdminTheme(page, theme);
    await page.goto(listPath);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

    const labelsCell = page.getByRole('row', { name: /Shipped/ }).locator('td.cell-labels');

    await expectPills(labelsCell);

    const pills = await readPillColors(labelsCell);

    for (const [index, pill] of pills.entries()) {
      expect(contrast(pill), `${labels[index]} contrast in ${theme}`).toBeGreaterThanOrEqual(4.5);
    }

    const byColor = Object.fromEntries(labels.map((color, index) => [color, pills[index]]));

    for (const [a, b] of [
      ['blue', 'cyan'],
      ['cyan', 'teal'],
      ['blue', 'teal'],
    ] as const) {
      expect(
        colorDifference(byColor[a].background, byColor[b].background),
        `${a}/${b} background difference in ${theme}`,
      ).toBeGreaterThanOrEqual(10);
      expect(
        colorDifference(byColor[a].text, byColor[b].text),
        `${a}/${b} text difference in ${theme}`,
      ).toBeGreaterThanOrEqual(10);
    }

    await labelsCell.screenshot({ path: testInfo.outputPath(`option-pills-${theme}.png`) });
  });
}

test('the API returns the stored values with no colour', async ({ page }) => {
  const response = await page.request.get(`/api/${tasksSlug}/${shippedId}`);

  expect(response.ok()).toBe(true);

  const document = await response.json();

  expect(document.status).toBe('done');
  expect(document.labels).toStrictEqual(labels);
  expect(JSON.stringify(document)).not.toContain('color');
});
