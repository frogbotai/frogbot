import { expect, type Locator, type Page, test } from '@playwright/test';

import { tasksSlug, timesheetsSlug } from './fixtures/question/shared';

const day = '2026-01-15';

const full = {
  title: 'Full',
  progress: 0.425,
  score: 3,
  timeSpent: 5400,
  website: 'example.com/pricing',
  phone: '5551234567',
  sku: '0123456789012',
  dueAt: `${day}T12:00:00.000Z`,
};

const empty = { title: 'Empty', dueAt: `${day}T15:00:00.000Z` };

const zero = { title: 'Zero', progress: 0, timeSpent: 0 };

const kindFields = ['progress', 'score', 'timeSpent', 'website', 'phone', 'sku'] as const;

const kindLabels = ['Progress', 'Score', 'Time Spent', 'Website', 'Phone', 'Sku'];

const longWebsite = `example.com/${'a'.repeat(300)}`;

let ids: Record<'full' | 'empty' | 'zero', number | string>;

const listPath = (columns: string[]) =>
  `/collections/${tasksSlug}?columns=${encodeURIComponent(JSON.stringify(columns))}`;

const boardPath = `/collections/${tasksSlug}/board`;

const calendarPath = `/collections/${tasksSlug}/calendar?mode=month&date=${day}T00:00:00.000Z`;

const taskPath = (id: number | string) => `/collections/${tasksSlug}/${id}`;

async function createTask(page: Page, data: Record<string, unknown>) {
  const response = await page.request.post(`/api/${tasksSlug}`, { data });

  expect(response.ok()).toBe(true);

  return (await response.json()).doc.id as number | string;
}

async function updateTask(page: Page, id: number | string, data: Record<string, unknown>) {
  expect((await page.request.patch(`/api/${tasksSlug}/${id}`, { data })).ok()).toBe(true);
}

async function storedTask(page: Page, id: number | string) {
  const response = await page.request.get(`/api/${tasksSlug}/${id}`);

  expect(response.ok()).toBe(true);

  return response.json();
}

async function save(page: Page, id: number | string) {
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      new URL(response.url()).pathname === `/api/${tasksSlug}/${id}`,
  );

  await page.getByRole('button', { name: 'Save', exact: true }).click();

  expect((await saved).ok()).toBe(true);
}

function listRow(page: Page, title: string) {
  return page.locator('tr', {
    has: page.locator('td.cell-title', { hasText: new RegExp(`^${title}$`) }),
  });
}

function boardCard(page: Page, title: string) {
  return page.locator('.frog-board__card', {
    has: page.locator('.collection-board__title', { hasText: new RegExp(`^${title}$`) }),
  });
}

function boardValue(card: Locator, label: string) {
  return card
    .locator('.collection-board__field', {
      has: card.page().locator('.collection-board__field-label', {
        hasText: new RegExp(`^${label}$`),
      }),
    })
    .locator('.collection-board__field-value');
}

async function expectStars(scope: Locator, count: number) {
  const stars = scope.getByRole('img', { name: `${count} of 5` });

  await expect(stars).toBeVisible();
  await expect(stars.locator('.rating-stars__star--on')).toHaveCount(count);
}

async function rejection(page: Page, data: Record<string, unknown>) {
  const response = await page.request.post(`/api/${tasksSlug}`, {
    data: { title: 'Rejected', ...data },
    failOnStatusCode: false,
  });

  expect(response.status()).toBe(400);

  return (await response.json()).errors[0].data.errors;
}

test.beforeEach(async ({ context, page }) => {
  await context.route('https://example.com/**', (route) =>
    route.fulfill({ body: 'ok', contentType: 'text/plain' }),
  );

  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);

  ids = {
    full: await createTask(page, full),
    empty: await createTask(page, empty),
    zero: await createTask(page, zero),
  };
});

test.afterEach(async ({ page }) => {
  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
});

test('the List shows each kind formatted', async ({ page }) => {
  await page.goto(listPath(['title', ...kindFields]));

  const row = listRow(page, full.title);

  await expect(row.locator('td.cell-progress')).toHaveText('42.5%');
  await expectStars(row.locator('td.cell-score'), 3);
  await expect(row.locator('td.cell-timeSpent')).toHaveText('1:30');

  const website = row.locator('td.cell-website a');

  await expect(website).toHaveText(full.website);
  await expect(website).toHaveAttribute('href', 'https://example.com/pricing');
  await expect(website).toHaveAttribute('target', '_blank');
  await expect(website).toHaveAttribute('rel', 'noopener noreferrer');

  const phone = row.locator('td.cell-phone a');

  await expect(phone).toHaveText('(555) 123-4567');
  await expect(phone).toHaveAttribute('href', 'tel:5551234567');
  await expect(row.locator('td.cell-sku')).toHaveText(full.sku);
});

test('the List leaves empty kind values blank and shows zero as zero', async ({ page }) => {
  await page.goto(listPath(['title', ...kindFields]));

  const row = listRow(page, empty.title);

  for (const name of kindFields) {
    const cell = row.locator(`td.cell-${name}`);

    await expect(cell).toHaveText('');
    await expect(cell.locator('a, [role="img"]')).toHaveCount(0);
  }

  const zeroRow = listRow(page, zero.title);

  await expect(zeroRow.locator('td.cell-progress')).toHaveText('0.0%');
  await expect(zeroRow.locator('td.cell-timeSpent')).toHaveText('0:00');
});

for (const [name, text] of [
  ['website', full.website],
  ['phone', '(555) 123-4567'],
] as const) {
  test(`a ${name} in the first List column is plain text inside the row link`, async ({ page }) => {
    await page.goto(listPath([name, 'title']));

    const cell = listRow(page, full.title).locator(`td.cell-${name}`);
    const link = cell.locator('a');

    await expect(link).toHaveCount(1);
    await expect(link).toHaveText(text);
    expect(await link.getAttribute('href')).toMatch(new RegExp(`${taskPath(ids.full)}$`));
    await expect(cell.locator('a a')).toHaveCount(0);
  });
}

test('a Board card URL opens the site in a new tab without opening the card', async ({ page }) => {
  await page.goto(boardPath);

  const popup = page.waitForEvent('popup');

  await boardCard(page, full.title).locator('a.url-cell').click();

  const site = await popup;

  await expect(site).toHaveURL('https://example.com/pricing');
  expect(await site.evaluate(() => window.opener)).toBeNull();
  await expect(page.locator(`dialog[id*="doc-drawer_${tasksSlug}"]`)).toHaveCount(0);
});

test('a Board card title still opens the card', async ({ page }) => {
  await page.goto(boardPath);

  await boardCard(page, full.title).locator('.collection-board__title').click();

  await expect(page.locator(`dialog[id*="doc-drawer_${tasksSlug}"]`)).toBeVisible();
});

test('Board cards and Calendar events show kind values and leave empty ones blank', async ({
  page,
}) => {
  await page.goto(boardPath);

  const card = boardCard(page, full.title);

  await expect(boardValue(card, 'Progress')).toHaveText('42.5%');
  await expectStars(boardValue(card, 'Score'), 3);
  await expect(boardValue(card, 'Time Spent')).toHaveText('1:30');
  await expect(boardValue(card, 'Website').locator('a')).toHaveAttribute(
    'href',
    'https://example.com/pricing',
  );
  await expect(boardValue(card, 'Phone').locator('a')).toHaveAttribute('href', 'tel:5551234567');
  await expect(boardValue(card, 'Sku')).toHaveText(full.sku);

  const emptyCard = boardCard(page, empty.title);

  for (const label of kindLabels) {
    await expect(boardValue(emptyCard, label)).toHaveText('');
  }

  await page.goto(calendarPath);

  const event = page.locator('.frog-calendar__event', { hasText: full.title });

  await expect(event).toContainText('42.5%');
  await expect(event.locator('a.url-cell')).toHaveAttribute('href', 'https://example.com/pricing');

  const emptyEvent = page.locator('.frog-calendar__event', { hasText: empty.title });

  await expect(emptyEvent).toBeVisible();
  await expect(emptyEvent).not.toContainText('%');
  await expect(emptyEvent.locator('a')).toHaveCount(0);
});

test('a long URL is cut with an ellipsis in the List and stays inside its Board card', async ({
  page,
}) => {
  await updateTask(page, ids.full, { website: longWebsite });
  await page.goto(listPath(['title', 'website']));

  const cell = listRow(page, full.title).locator('td.cell-website .url-cell');

  await expect(cell).toHaveAttribute('title', longWebsite);
  await expect(cell).toHaveCSS('text-overflow', 'ellipsis');
  expect(await cell.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);

  await page.goto(boardPath);

  const card = boardCard(page, full.title);
  const url = boardValue(card, 'Website').locator('.url-cell');

  await expect(url).toBeVisible();

  const cardBox = await card.boundingBox();
  const urlBox = await url.boundingBox();

  expect(urlBox!.x + urlBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width);
});

test('a percent typed as 7 saves 0.07 and shows 7 again', async ({ page }) => {
  await page.goto(taskPath(ids.full));
  await page.locator('#field-progress').fill('7');
  await save(page, ids.full);

  expect((await storedTask(page, ids.full)).progress).toBe(0.07);

  await page.reload();

  await expect(page.locator('#field-progress')).toHaveValue('7');
});

test('a duration typed as 1:30 saves 5400 seconds', async ({ page }) => {
  await page.goto(taskPath(ids.zero));

  const input = page.locator('#field-timeSpent');

  await expect(input).toHaveValue('0:00');
  await input.fill('');
  await input.fill('1:30');
  await save(page, ids.zero);

  expect((await storedTask(page, ids.zero)).timeSpent).toBe(5400);
});

test('clicking a star saves that rating', async ({ page }) => {
  await page.goto(taskPath(ids.full));
  await page.locator('label.rating-field__option', { hasText: '4 stars' }).click();
  await save(page, ids.full);

  expect((await storedTask(page, ids.full)).score).toBe(4);
});

test('clicking the chosen star clears the rating', async ({ page }) => {
  await updateTask(page, ids.full, { score: 4 });
  await page.goto(taskPath(ids.full));
  await expect(page.getByRole('radio', { name: '4 stars' })).toBeChecked();
  await page.locator('label.rating-field__option', { hasText: '4 stars' }).click();
  await save(page, ids.full);

  expect((await storedTask(page, ids.full)).score).toBeNull();
});

test('ArrowRight moves the rating up one star', async ({ page }) => {
  await updateTask(page, ids.full, { score: 2 });
  await page.goto(taskPath(ids.full));

  const two = page.getByRole('radio', { name: '2 stars' });

  await expect(two).toBeChecked();
  await two.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: '3 stars' })).toBeChecked();
  await save(page, ids.full);

  expect((await storedTask(page, ids.full)).score).toBe(3);
});

for (const { name, field, text, message, stored, shown } of [
  {
    name: 'duration',
    field: 'timeSpent',
    text: '1:75',
    message: 'Enter a duration such as 1:30.',
    stored: full.timeSpent,
    shown: '1:30',
  },
  {
    name: 'percent',
    field: 'progress',
    text: 'abc',
    message: 'Enter a percentage such as 42.5.',
    stored: full.progress,
    shown: '42.5',
  },
] as const) {
  test(`unreadable ${name} text shows the message on blur and Save stores nothing`, async ({
    page,
  }) => {
    await page.goto(taskPath(ids.full));

    const input = page.locator(`#field-${field}`);
    const error = page.locator(`.${name}-field .field-error`);

    await input.fill(text);
    await input.blur();

    await expect(error).toContainText(message);
    await expect(input).toHaveValue(text);

    await save(page, ids.full);

    expect((await storedTask(page, ids.full))[field]).toBe(stored);
    await expect(input).toHaveValue(shown);
  });
}

test('Save Draft with unreadable duration text keeps the stored value', async ({ page }) => {
  const created = await page.request.post(`/api/${timesheetsSlug}`, {
    data: { title: 'Week 3', logged: 5400, _status: 'published' },
  });

  expect(created.ok()).toBe(true);

  const { id } = (await created.json()).doc;

  await page.goto(`/collections/${timesheetsSlug}/${id}`);

  const input = page.locator('#field-logged');

  await expect(input).toHaveValue('1:30');
  await input.fill('');
  await input.pressSequentially('1:75');

  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      new URL(response.url()).pathname === `/api/${timesheetsSlug}/${id}`,
  );

  await page.getByRole('button', { name: 'Save Draft' }).click();

  expect((await saved).ok()).toBe(true);

  const draft = await page.request.get(`/api/${timesheetsSlug}/${id}?draft=true`);

  expect((await draft.json()).logged).toBe(5400);
  await expect(input).toHaveValue('1:30');
});

for (const { data, path, message } of [
  { data: { score: 3.5 }, path: 'score', message: 'Enter a whole number of stars from 1 to 5.' },
  { data: { score: 0 }, path: 'score', message: '0 is less than the min allowed Value of 1.' },
  { data: { score: 6 }, path: 'score', message: '6 is greater than the max allowed Value of 5.' },
  { data: { timeSpent: 1.5 }, path: 'timeSpent', message: 'Enter a duration in whole seconds.' },
  {
    data: { website: 'javascript:alert(1)' },
    path: 'website',
    message: 'Enter a web address such as https://example.com.',
  },
  {
    data: { website: 'mailto:a@b.com' },
    path: 'website',
    message: 'Enter a web address such as https://example.com.',
  },
  {
    data: { website: 'a b.com' },
    path: 'website',
    message: 'Enter a web address such as https://example.com.',
  },
  {
    data: { website: 'localhost:3000' },
    path: 'website',
    message: 'Enter a web address such as https://example.com.',
  },
  {
    data: { phone: 'call me' },
    path: 'phone',
    message: 'Enter a phone number with 7 to 15 digits.',
  },
]) {
  test(`the API rejects ${JSON.stringify(data)}`, async ({ page }) => {
    expect(await rejection(page, data)).toStrictEqual([expect.objectContaining({ path, message })]);

    const response = await page.request.get(`/api/${tasksSlug}?where[title][equals]=Rejected`);

    expect((await response.json()).totalDocs).toBe(0);
  });
}
