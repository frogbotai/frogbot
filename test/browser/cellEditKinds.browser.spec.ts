import { expect, type Locator, type Page, test } from '@playwright/test';

import {
  cellAccessSlug,
  cellDraftsSlug,
  cellKindsSlug,
  tagsSlug,
} from './fixtures/question/shared';

type Doc = Record<string, unknown> & { id: number | string };

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e6)}`;

async function create(page: Page, collection: string, data: Record<string, unknown>) {
  const response = await page.request.post(`/api/${collection}`, { data });

  expect(response.ok()).toBe(true);

  return (await response.json()).doc as Doc;
}

async function stored(page: Page, collection: string, id: number | string, draft = false) {
  const response = await page.request.get(
    `/api/${collection}/${id}?depth=0${draft ? '&draft=true' : ''}`,
  );

  return (await response.json()) as Doc;
}

function cell(page: Page, title: string, column: string) {
  return page.locator('tbody tr', { hasText: title }).locator(`td.cell-${column}`);
}

function editor(target: Locator) {
  return target.locator('.fb-cell-editor');
}

async function open(page: Page, collection: string, search: string) {
  await page.goto(`/collections/${collection}?search=${encodeURIComponent(search)}`);
}

async function typeAndSave(page: Page, target: Locator, text: string) {
  await target.click();
  await expect(editor(target).locator('input').first()).toBeFocused();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await expect(editor(target)).toHaveCount(0);
}

test('every kind with an input edits in its cell', async ({ page }) => {
  const title = `Kinds ${stamp()}`;
  const doc = await create(page, cellKindsSlug, { title });

  await open(page, cellKindsSlug, title);

  const typed: Array<[string, string, (value: unknown) => boolean]> = [
    ['budget', '12.5', (value) => value === 12.5],
    ['progress', '42.5', (value) => value === 0.425],
    ['timeSpent', '1:30', (value) => value === 5400],
    ['website', 'example.com/pricing', (value) => String(value).includes('example.com/pricing')],
    ['phone', '5551234567', (value) => String(value).replace(/\D/g, '').endsWith('5551234567')],
    ['sku', '0123456789012', (value) => value === '0123456789012'],
    ['color', '#3B82F6', (value) => value === '#3B82F6'],
    ['blurb', 'Written by hand', (value) => value === 'Written by hand'],
  ];

  for (const [column, text, check] of typed) {
    await typeAndSave(page, cell(page, title, column), text);

    await expect
      .poll(async () => check((await stored(page, cellKindsSlug, doc.id))[column]), {
        message: column,
      })
      .toBe(true);
  }

  const score = cell(page, title, 'score');

  await score.click();
  await editor(score).locator('label', { hasText: '4 stars' }).click();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await stored(page, cellKindsSlug, doc.id)).score).toBe(4);
  await expect(editor(score)).toHaveCount(0);
});

test('an invalid value shows the field error and sends nothing', async ({ page }) => {
  const title = `Invalid ${stamp()}`;

  await create(page, cellKindsSlug, { title, progress: 0.1 });
  await open(page, cellKindsSlug, title);

  const sent: string[] = [];

  page.on('request', (request) => {
    if (request.method() === 'PATCH') sent.push(request.url());
  });

  const progress = cell(page, title, 'progress');

  await progress.click();
  await expect(editor(progress).locator('input')).toBeFocused();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('abc');
  await page.keyboard.press('Enter');

  await expect(editor(progress).locator('.field-type.error')).toHaveCount(1);
  await expect(editor(progress).locator('input')).toHaveValue('abc');
  expect(sent).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(editor(progress)).toHaveCount(0);
  await expect(progress).toContainText('10');
});

test('read-only, denied, generated and hasMany cells stay plain', async ({ page }) => {
  const title = `Plain ${stamp()}`;
  const tag = await create(page, tagsSlug, { name: `Tag ${stamp()}` });

  await create(page, cellKindsSlug, { title, tags: [tag.id] });
  await open(page, cellKindsSlug, title);

  await expect(cell(page, title, 'budget')).toHaveAttribute('data-cell-edit', 'budget');

  for (const column of ['title', 'number', 'locked', 'secret', 'tags']) {
    await expect(cell(page, title, column)).not.toHaveAttribute('data-cell-edit');
  }

  await cell(page, title, 'tags').click();
  await expect(page.locator('.fb-record-panel')).toBeVisible();
  await expect(page.locator('.fb-cell-editor')).toHaveCount(0);
});

test('a drafts collection saves a cell as a draft and never publishes', async ({ page }) => {
  const title = `Draft ${stamp()}`;
  const doc = await create(page, cellDraftsSlug, {
    title,
    note: 'published',
    _status: 'published',
  });

  await open(page, cellDraftsSlug, title);

  const saved = page.waitForRequest(
    (request) =>
      request.method() === 'PATCH' && new URL(request.url()).pathname.endsWith(`/${doc.id}`),
  );

  await typeAndSave(page, cell(page, title, 'note'), 'drafted');

  const request = await saved;

  expect(new URL(request.url()).searchParams.get('draft')).toBe('true');
  await expect
    .poll(async () => (await stored(page, cellDraftsSlug, doc.id, true)).note)
    .toBe('drafted');

  const draft = await stored(page, cellDraftsSlug, doc.id, true);
  const published = await stored(page, cellDraftsSlug, doc.id);

  expect(draft._status).toBe('draft');
  expect(published.note).toBe('published');
  await expect(cell(page, title, 'note')).toContainText('drafted');
});

test('a field whose condition reads another field edits in its cell', async ({ page }) => {
  const title = `Condition ${stamp()}`;
  const doc = await create(page, cellDraftsSlug, { title, extra: 'before' });

  await open(page, cellDraftsSlug, title);
  await typeAndSave(page, cell(page, title, 'extra'), 'after');

  await expect
    .poll(async () => (await stored(page, cellDraftsSlug, doc.id, true)).extra)
    .toBe('after');
});

test('a group field whose condition reads a sibling stays open while typing and saves', async ({
  page,
}) => {
  const title = `Cond ${stamp()}`;
  const doc = await create(page, cellAccessSlug, {
    title,
    address: { country: 'US', city: 'Austin' },
  });

  await open(page, cellAccessSlug, title);

  const city = cell(page, title, 'address__city');

  await expect(city).toHaveAttribute('data-cell-edit', 'address.city');
  await city.click();
  await expect(editor(city).locator('input')).toBeFocused();
  await page.keyboard.press('ControlOrMeta+a');

  const changed = page.waitForResponse((response) => response.request().method() === 'POST');

  await page.keyboard.type('Dallas');
  await changed;
  await expect(editor(city).locator('input')).toHaveValue('Dallas');
  await page.keyboard.press('Enter');
  await expect(editor(city)).toHaveCount(0);

  await expect
    .poll(async () => (await stored(page, cellAccessSlug, doc.id)).address)
    .toMatchObject({ city: 'Dallas', country: 'US' });
});

test('a row the person may not update stays plain', async ({ page }) => {
  const title = `Closed ${stamp()}`;

  await create(page, cellAccessSlug, { title, open: false, note: 'before' });
  await create(page, cellAccessSlug, { title: `${title} open`, note: 'before' });
  await open(page, cellAccessSlug, title);

  await expect(cell(page, `${title} open`, 'note')).toHaveAttribute('data-cell-edit', 'note');
  await expect(page.locator('tbody tr', { hasText: title }).first()).toBeVisible();

  const closed = page.locator('tbody tr', { hasText: title }).filter({ hasNotText: 'open' });

  await expect(closed.locator('td.cell-note')).not.toHaveAttribute('data-cell-edit');
});

test('a field whose update access denies this record stays plain', async ({ page }) => {
  const title = `Archived ${stamp()}`;

  await create(page, cellAccessSlug, { title, archived: true, note: 'before' });
  await create(page, cellAccessSlug, { title: `${title} live`, note: 'before' });
  await open(page, cellAccessSlug, title);

  await expect(cell(page, `${title} live`, 'note')).toHaveAttribute('data-cell-edit', 'note');

  const archived = page.locator('tbody tr', { hasText: title }).filter({ hasNotText: 'live' });

  await expect(archived.locator('td.cell-note')).not.toHaveAttribute('data-cell-edit');
});
