import { expect, type Locator, type Page, test } from '@playwright/test';

import { approvalsSlug, archivesSlug, photosSlug, storiesSlug } from './fixtures/question/shared';

type Story = { _order: string; id: number | string; status?: string | null; title: string };

let consoleErrors: string[];
let expectedErrors: RegExp[];

test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  expectedErrors = [/net::ERR_TUNNEL_CONNECTION_FAILED/];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  page.on('pageerror', (error) => consoleErrors.push(error.message));

  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
});

test.afterEach(() => {
  expect(
    consoleErrors.filter((message) => !expectedErrors.some((pattern) => pattern.test(message))),
  ).toEqual([]);
});

const column = (page: Page, label: string) =>
  page.locator(`.frog-board__column[aria-label="${label}"]`);

const count = (page: Page, label: string) =>
  column(page, label).locator('.frog-board__column-count');

const titles = (page: Page, label: string) =>
  column(page, label).locator('.frog-board__card:not(.frog-board__inline) .fb-card__title');

async function create(page: Page, data: Record<string, unknown>, slug = storiesSlug) {
  const response = await page.request.post(`/api/${slug}`, { data });

  expect(response.ok()).toBe(true);

  return ((await response.json()) as { doc: Story }).doc;
}

async function stored(page: Page, slug = storiesSlug) {
  const response = await page.request.get(`/api/${slug}?sort=_order&limit=0&depth=0`);

  return ((await response.json()) as { docs: Story[] }).docs;
}

async function drag(page: Page, source: Locator, target: Locator, edge: 'top' | 'middle') {
  const from = (await source.boundingBox())!;
  const to = (await target.boundingBox())!;
  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 8, startY + 8, { steps: 4 });

  await page.mouse.move(to.x + to.width / 2, edge === 'top' ? to.y + 6 : to.y + to.height / 2, {
    steps: 12,
  });

  await page.mouse.up();
}

const savedPreference = (page: Page) =>
  page.waitForResponse(
    (response) =>
      response.url().includes('/api/payload-preferences/') &&
      response.request().method() === 'POST',
  );

async function columnMenu(page: Page, label: string, item: string) {
  await page.getByRole('button', { name: `${label} column options` }).click();

  const saved = savedPreference(page);

  await page.getByRole('menuitem', { name: item }).click();
  expect((await saved).ok()).toBe(true);
}

test('adds cards in a row with Enter, in typing order, with the column value', async ({ page }) => {
  await page.goto(`/collections/${storiesSlug}`);
  await expect(count(page, 'Doing')).toHaveText('0');

  await page.getByRole('button', { name: 'Add a card to Doing' }).click();
  await page.keyboard.type('First');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second');
  await page.keyboard.press('Enter');

  await expect(
    column(page, 'Doing').getByRole('textbox', { name: 'Card title' }).last(),
  ).toBeFocused();

  await page.keyboard.press('Escape');

  await expect(titles(page, 'Doing')).toHaveText(['First', 'Second']);
  await expect(count(page, 'Doing')).toHaveText('2');
  await expect(column(page, 'Doing').locator('.frog-board__inline')).toHaveCount(0);

  const docs = await stored(page);

  expect(docs.map(({ status, title }) => ({ status, title }))).toEqual([
    { status: 'doing', title: 'First' },
    { status: 'doing', title: 'Second' },
  ]);
});

test('discards a card on Escape and removes an empty one on blur', async ({ page }) => {
  await page.goto(`/collections/${storiesSlug}`);

  const add = page.getByRole('button', { name: 'Add a card to Todo' });
  const inline = column(page, 'Todo').locator('.frog-board__inline');

  await add.click();
  await page.keyboard.type('Never mind');
  await page.keyboard.press('Escape');
  await expect(inline).toHaveCount(0);

  await add.click();
  await expect(inline).toHaveCount(1);
  await page.locator('.collection-board').click({ position: { x: 2, y: 2 } });
  await expect(inline).toHaveCount(0);

  await add.click();
  await page.keyboard.type('Saved on blur');
  await page.locator('.collection-board').click({ position: { x: 2, y: 2 } });
  await expect(titles(page, 'Todo')).toHaveText(['Saved on blur']);
  await expect(inline).toHaveCount(0);
  expect((await stored(page)).map(({ title }) => title)).toEqual(['Saved on blur']);
});

test('keeps a failed card, rolls back the total and offers the form', async ({ page }) => {
  expectedErrors.push(/status of 400/);

  await page.route(`**/api/${storiesSlug}?depth=1`, (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          contentType: 'application/json',
          json: { errors: [{ message: 'The server said no' }] },
          status: 400,
        })
      : route.continue(),
  );

  await page.goto(`/collections/${storiesSlug}`);
  await page.getByRole('button', { name: 'Add a card to Todo' }).click();
  await page.keyboard.type('Rejected');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');

  const failed = column(page, 'Todo').locator('.frog-board__inline--error');

  await expect(failed.getByRole('alert')).toContainText('The server said no');
  await expect(failed.getByRole('textbox')).toHaveValue('Rejected');
  await expect(count(page, 'Todo')).toHaveText('0');

  await page.unroute(`**/api/${storiesSlug}?depth=1`);
  await failed.getByRole('button', { name: 'Open form' }).click();

  const drawer = page.locator('.drawer__content').last();

  await expect(drawer.locator('#field-title')).toHaveValue('Rejected');
  await drawer.locator('#action-save').click();

  await expect(titles(page, 'Todo')).toHaveText(['Rejected']);
  await expect(column(page, 'Todo').locator('.frog-board__inline')).toHaveCount(0);
  expect((await stored(page)).map(({ status, title }) => ({ status, title }))).toEqual([
    { status: 'todo', title: 'Rejected' },
  ]);
});

test('opens the prefilled form when the collection needs more than a title', async ({ page }) => {
  await page.goto(`/collections/${approvalsSlug}`);
  await page.getByRole('button', { name: 'Add a card to Doing' }).click();

  await expect(column(page, 'Doing').locator('.frog-board__inline')).toHaveCount(0);

  const drawer = page.locator('.drawer__content').last();

  await expect(drawer.locator('#field-status')).toContainText('Doing');
  await drawer.locator('#field-title').fill('Budget');
  await drawer.locator('#field-approver').fill('Ana');
  await drawer.locator('#action-save').click();

  await expect(titles(page, 'Doing')).toHaveText(['Budget']);
  await expect(count(page, 'Doing')).toHaveText('1');
});

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

async function createApprovalWithPhoto(page: Page) {
  const photo = await page.request.post(`/api/${photosSlug}`, {
    multipart: {
      _payload: JSON.stringify({ alt: 'Launch photo' }),
      file: { buffer: pixel, mimeType: 'image/png', name: 'launch.png' },
    },
  });

  expect(photo.ok()).toBe(true);
  const { doc } = (await photo.json()) as { doc: { id: number | string } };

  return create(
    page,
    { approver: 'Ada', photo: doc.id, status: 'todo', title: 'Launch plan' },
    approvalsSlug,
  );
}

test('keeps a card image after a save in the document drawer', async ({ page }) => {
  await createApprovalWithPhoto(page);
  await page.goto(`/collections/${approvalsSlug}`);

  const card = column(page, 'Todo').locator('.frog-board__card', {
    has: page.locator('.fb-card__title', { hasText: /^Launch plan$/ }),
  });

  const image = card.locator('.fb-card__image img');

  await expect(image).toHaveAttribute('src', /\/api\/photos\/file\//);
  await card.locator('.fb-card__title').click();

  const drawer = page.locator('.drawer__content').last();

  await expect(drawer.locator('#field-title')).toHaveValue('Launch plan');
  await drawer.locator('#field-approver').fill('Grace');
  await drawer.locator('#action-save').click();
  await expect(page.locator('.payload-toast-container')).toContainText(/success/i);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();

  await expect(image).toHaveAttribute('src', /\/api\/photos\/file\//);
});

test('offers no Add without create access', async ({ page }) => {
  await page.goto(`/collections/${archivesSlug}`);

  await expect(column(page, 'Todo')).toBeVisible();
  await expect(page.locator('.frog-board__add')).toHaveCount(0);
});

test('saves a reorder inside a column across a reload', async ({ page }) => {
  for (const title of ['A', 'B', 'C']) await create(page, { status: 'todo', title });

  await page.goto(`/collections/${storiesSlug}`);
  await expect(titles(page, 'Todo')).toHaveText(['A', 'B', 'C']);

  const response = page.waitForResponse((res) => res.url().endsWith('/api/reorder'));

  await drag(page, titles(page, 'Todo').nth(2), titles(page, 'Todo').nth(0), 'top');
  expect((await response).ok()).toBe(true);

  await expect(titles(page, 'Todo')).toHaveText(['C', 'A', 'B']);
  await page.reload();
  await expect(titles(page, 'Todo')).toHaveText(['C', 'A', 'B']);
});

test('shows true totals past one page and keeps them right after a move', async ({ page }) => {
  for (let index = 0; index < 20; index += 1) {
    await create(page, { status: 'todo', title: `Story ${String(index).padStart(2, '0')}` });
  }

  await page.goto(`/collections/${storiesSlug}`);

  await expect(count(page, 'Todo')).toHaveText('20');
  await expect(count(page, 'Done')).toHaveText('0');
  await expect(column(page, 'Done').getByText('No cards')).toBeVisible();

  await drag(page, titles(page, 'Todo').first(), column(page, 'Done'), 'middle');

  await expect(count(page, 'Todo')).toHaveText('19');
  await expect(count(page, 'Done')).toHaveText('1');
  await expect(titles(page, 'Done')).toHaveText(['Story 00']);
  await expect(column(page, 'Done').getByText('No cards')).toHaveCount(0);
  await expect
    .poll(async () => (await stored(page)).filter(({ status }) => status === 'done').length)
    .toBe(1);
});

test('collapses, hides and restores columns, remembered after a reload', async ({ page }) => {
  await create(page, { status: 'todo', title: 'Only' });
  await page.goto(`/collections/${storiesSlug}`);

  await columnMenu(page, 'Todo', 'Collapse column');

  const strip = page.getByRole('button', { name: 'Expand Todo' });

  await expect(strip).toBeVisible();
  await expect(strip).toContainText('1');
  expect((await column(page, 'Todo').boundingBox())!.width).toBeLessThan(60);

  await columnMenu(page, 'Doing', 'Hide column');
  await expect(column(page, 'Doing')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Hidden · 1' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Expand Todo' })).toBeVisible();
  await expect(column(page, 'Doing')).toHaveCount(0);

  await page.getByRole('button', { name: 'Hidden · 1' }).click();

  const shown = savedPreference(page);

  await page.getByRole('menuitem', { name: 'Show Doing' }).click();
  expect((await shown).ok()).toBe(true);
  await expect(column(page, 'Doing')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Hidden/ })).toHaveCount(0);

  const expanded = savedPreference(page);

  await page.getByRole('button', { name: 'Expand Todo' }).click();
  expect((await expanded).ok()).toBe(true);
  await expect(titles(page, 'Todo')).toHaveText(['Only']);

  await page.reload();
  await expect(titles(page, 'Todo')).toHaveText(['Only']);
  await expect(column(page, 'Doing')).toBeVisible();
});

test('keeps the total right when a move refreshes it during an inline save', async ({ page }) => {
  await create(page, { status: 'todo', title: 'a' });
  await create(page, { status: 'todo', title: 'b' });
  await page.goto(`/collections/${storiesSlug}`);
  await expect(count(page, 'Todo')).toHaveText('2');

  let release = () => {};

  const held = new Promise<void>((resolve) => (release = resolve));

  await page.route(`**/api/${storiesSlug}?depth=1`, async (route) => {
    if (route.request().method() === 'POST') await held;
    await route.continue();
  });

  await page.getByRole('button', { name: 'Add a card to Todo' }).click();
  await page.keyboard.type('Held');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(count(page, 'Todo')).toHaveText('3');

  const refreshed = page.waitForResponse((response) => response.url().includes('/aggregate'));

  await drag(page, titles(page, 'Todo').first(), column(page, 'Doing'), 'middle');
  await refreshed;
  await expect(count(page, 'Todo')).toHaveText('2');

  release();

  await expect(titles(page, 'Todo')).toHaveText(['b', 'Held']);
  await expect(count(page, 'Todo')).toHaveText('2');
  await expect(count(page, 'Doing')).toHaveText('1');
});
