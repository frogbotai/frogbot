import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, type Locator, type Page, test } from '@playwright/test';

import { prepareView, shootView } from './__helpers/viewShots';
import { timezoneId } from './fixtures/crm/shared';

test.use({ timezoneId });

const preferenceKeys = ['collection-deals', 'collection-deals-view-list'];
const viewPreference = '/api/payload-preferences/collection-deals-view-list';
const plainList = '/collections/deals?limit=10';
const shots = path.join(path.dirname(fileURLToPath(import.meta.url)), 'test-results', 'list-grid');

const header = (page: Page, column: string) =>
  page.locator(`.fb-list-grid .table thead th[id="heading-${column}"]`).first();

const cells = (page: Page, column: string) =>
  page.locator(
    `.fb-list-grid .table :is(th[id="heading-${column}"], td.cell-${column}, tfoot [data-column="${column}"])`,
  );

const handle = (page: Page, column: string) =>
  header(page, column).locator('.fb-list-grid__resize');

const width = async (locator: Locator) =>
  Math.round((await locator.boundingBox())?.width ?? Number.NaN);

const cleanups: (() => Promise<unknown>)[] = [];

async function resetPreferences(page: Page) {
  for (const key of [...preferenceKeys, 'collection-contacts-view-list']) {
    await page.request.delete(`/api/payload-preferences/${key}`);
  }
}

async function savePreference(page: Page, value: Record<string, unknown>) {
  await page.request.post(viewPreference, { data: { value } });
}

async function storedPreference(page: Page): Promise<Record<string, unknown>> {
  const response = await page.request.get(viewPreference);

  return response.ok() ? ((await response.json()) as { value: Record<string, unknown> }).value : {};
}

async function drag(page: Page, column: string, by: number) {
  const box = await handle(page, column).boundingBox();

  if (!box) throw new Error(`no resize handle on ${column}`);

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + by / 2, y, { steps: 4 });
  await page.mouse.move(x + by, y, { steps: 4 });
  await page.mouse.up();
}

const background = (locator: Locator) =>
  locator.evaluate((element) => getComputedStyle(element).backgroundColor);

const opaque = (color: string) =>
  !/rgba\(.*,\s*0(\.\d+)?\)$/.test(color) && color !== 'transparent';

async function swipeLeft(page: Page, on: Locator) {
  const box = await on.boundingBox();

  if (!box) throw new Error('nothing to swipe on');

  const session = await page.context().newCDPSession(page);
  const y = Math.round(box.y + box.height / 2);
  const touch = (type: 'touchEnd' | 'touchMove' | 'touchStart', x: number) =>
    session.send('Input.dispatchTouchEvent', {
      touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
      type,
    });

  await touch('touchStart', 300);

  for (let x = 290; x >= 60; x -= 10) await touch('touchMove', x);

  await touch('touchEnd', 60);
}

async function rowHeight(page: Page) {
  const box = await page.locator('.fb-list-grid .table tbody tr').first().boundingBox();

  return Math.round(box?.height ?? Number.NaN);
}

test.beforeEach(async ({ page }) => {
  await prepareView(page);
  await resetPreferences(page);
});

test.afterEach(async ({ page }) => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();

  await resetPreferences(page);
});

test('drags a column edge, steps it with the arrow keys, and keeps it after reload', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(plainList);
  await expect(page.locator('.fb-list-grid tbody tr')).toHaveCount(10);

  const before = await width(header(page, 'company'));

  await drag(page, 'company', 120);

  const dragged = await width(header(page, 'company'));

  expect(dragged).toBeGreaterThan(before + 100);
  expect(dragged).toBeLessThan(before + 140);

  for (const cell of await cells(page, 'company').all()) expect(await width(cell)).toBe(dragged);

  await expect
    .poll(async () => (await storedPreference(page)).widths)
    .toEqual({ company: dragged });

  await handle(page, 'company').focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => width(header(page, 'company'))).toBe(dragged + 16);
  await expect(handle(page, 'company')).toBeFocused();
  await expect(handle(page, 'company')).toHaveAttribute('aria-valuenow', String(dragged + 16));
  await expect
    .poll(async () => (await storedPreference(page)).widths)
    .toEqual({ company: dragged + 16 });

  const html = await (await page.request.get(plainList)).text();

  expect(html).toContain(`[class~="cell-company"]){width:${dragged + 16}px`);

  await page.reload();
  expect(await width(header(page, 'company'))).toBe(dragged + 16);
});

test('clamps a drag to 60 pixels and keeps the sort and filters it was saved beside', async ({
  page,
}) => {
  await page.goto('/collections/deals?limit=10&sort=name&where[stage][equals]=lead');
  await expect(page.locator('.fb-list-grid tbody tr').first()).toBeVisible();

  await drag(page, 'stage', -400);
  expect(await width(header(page, 'stage'))).toBe(60);

  await expect.poll(async () => (await storedPreference(page)).widths).toEqual({ stage: 60 });

  const stored = await storedPreference(page);

  expect(stored).toMatchObject({ limit: '10', sort: 'name', where: { stage: { equals: 'lead' } } });

  await page.goto('/collections/deals?limit=10&sort=-name');
  await expect(page.locator('.fb-list-grid tbody tr').first()).toBeVisible();
  expect(await width(header(page, 'stage'))).toBe(60);
  expect((await storedPreference(page)).widths).toEqual({ stage: 60 });
});

test('reaches the resize handle with Tab from a sortable header', async ({ page }) => {
  await page.goto(plainList);
  await header(page, 'name').getByRole('button').first().focus();
  await page.keyboard.press('Tab');
  await expect(handle(page, 'name')).toBeFocused();
});

test('another user keeps their own widths', async ({ browser, page }) => {
  const other = { email: 'grid-other@example.com', password: 'grid-other-password' };
  const created = await page.request.post('/api/users', { data: other });
  const { doc } = (await created.json()) as { doc: { id: number | string } };

  cleanups.push(() => page.request.delete(`/api/users/${doc.id}`));
  await savePreference(page, { widths: { company: 400 } });

  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: { cookies: [], origins: [] },
  });

  cleanups.push(() => context.close());

  const otherPage = await context.newPage();

  await otherPage.request.post('/api/users/login', { data: other });
  await otherPage.goto(plainList);
  await expect(otherPage.locator('.fb-list-grid tbody tr').first()).toBeVisible();
  await expect(otherPage.locator('.fb-list-grid style')).toHaveCount(0);
  expect(await width(header(otherPage, 'company'))).not.toBe(400);

  await page.goto(plainList);
  expect(await width(header(page, 'company'))).toBe(400);
});

test('gives a resized column one width in every group table and the summary', async ({ page }) => {
  await savePreference(page, { widths: { amount: 260 } });
  await page.goto('/collections/deals?groupBy=stage');
  await expect(page.locator('.fb-list-group').first()).toBeVisible();
  await expect(page.locator('tfoot.fb-list-summary')).toBeVisible();

  const tables = page.locator('.fb-list-grid .table table');

  expect(await tables.count()).toBeGreaterThan(1);

  const amounts = cells(page, 'amount');

  expect(await amounts.count()).toBeGreaterThan(await tables.count());

  for (const cell of await amounts.all()) expect(await width(cell)).toBe(260);

  expect(await width(page.locator('tfoot.fb-list-summary [data-column="amount"]'))).toBe(260);
});

test('lines up every group table and the summary without any resize', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/collections/deals?groupBy=stage');
  await expect(page.locator('tfoot.fb-list-summary')).toBeVisible();

  const tables = page.locator('.fb-list-grid .table table');

  expect(await tables.count()).toBeGreaterThan(2);

  const columns = await page
    .locator('.fb-list-grid .table thead')
    .first()
    .locator('th')
    .evaluateAll((headers) =>
      headers.map((header) => header.dataset.column ?? header.id.replace(/^heading-/, '')),
    );

  expect(columns).toEqual(expect.arrayContaining(['company', 'amount']));

  for (const column of columns.filter((name) => !name.startsWith('_'))) {
    const boxes = await page
      .locator(`.fb-list-grid .table thead th[id="heading-${column}"]`)
      .evaluateAll((headers) =>
        headers.map((header) => {
          const box = header.getBoundingClientRect();

          return [Math.round(box.left), Math.round(box.width)];
        }),
      );

    expect(boxes, column).toHaveLength(await tables.count());
    expect(new Set(boxes.map((box) => box.join(':'))).size, column).toBe(1);
  }

  const amount = header(page, 'amount');
  const sum = page.locator('tfoot.fb-list-summary [data-column="amount"]');

  expect(Math.round((await sum.boundingBox())?.x ?? 0)).toBe(
    Math.round((await amount.boundingBox())?.x ?? -1),
  );
  expect(await width(sum)).toBe(await width(amount));
});

test('freezes the selection and title columns while the grid scrolls sideways', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await savePreference(page, { widths: { company: 800, stage: 800, amount: 800 } });
  await page.goto(plainList);

  const scroller = page.locator('.fb-list-grid .table').first();
  const select = header(page, '_select');
  const title = header(page, 'name');
  const row = page.locator('.fb-list-grid tbody tr').first();
  const titleCell = row.locator('td.cell-name');
  const left = async (locator: Locator) => Math.round((await locator.boundingBox())?.x ?? 0);

  const startTitle = await left(title);
  const startSelect = await left(select);

  await scroller.evaluate((element) => element.scrollBy({ left: 900 }));
  await expect(scroller).toHaveAttribute('data-scrolled', '');

  expect(await left(title)).toBe(startTitle);
  expect(await left(titleCell)).toBe(startTitle);
  expect(await left(select)).toBe(startSelect);
  expect(await left(title)).toBe(
    startSelect + (await width(select)) + (await width(header(page, '_dragHandle'))),
  );

  expect(opaque(await background(titleCell))).toBe(true);

  const resting = await background(titleCell);

  await titleCell.hover();
  await expect.poll(() => background(titleCell)).not.toBe(resting);
  expect(opaque(await background(titleCell))).toBe(true);

  await row.locator('td.cell-_select input[type="checkbox"]').check();
  await page.mouse.move(0, 0);

  const selected = await background(titleCell);

  expect(opaque(selected)).toBe(true);
  expect(selected).not.toBe(resting);
});

test('on a phone the title scrolls, the header swipes, and Row height is reachable', async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    hasTouch: true,
    isMobile: true,
    storageState: test.info().project.use.storageState,
    viewport: { width: 390, height: 844 },
  });

  cleanups.push(() => context.close());

  const page = await context.newPage();

  await page.goto(plainList);

  const scroller = page.locator('.fb-list-grid .table').first();
  const title = header(page, 'name');
  const startTitle = Math.round((await title.boundingBox())?.x ?? 0);
  const touchAction = (locator: Locator) =>
    locator.evaluate((element) => getComputedStyle(element).touchAction);

  expect(await touchAction(handle(page, 'company'))).toBe('none');
  expect(await touchAction(header(page, 'company'))).toBe('auto');

  await swipeLeft(page, header(page, 'stage'));

  await expect.poll(() => scroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(50);
  expect(Math.round((await title.boundingBox())?.x ?? 0)).toBeLessThan(startTitle);

  await page.locator('.list-controls__actions #toggle-row-height').click();

  await expect(page.getByRole('menuitemradio', { name: 'Default' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('on a phone Row height sits with the other controls and search fills the row', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(plainList);

  const controls = page.locator('.list-controls');
  const rowHeightButton = page.locator(
    '.list-controls__actions > .view-controls__toolbar #toggle-row-height',
  );

  const filters = page.locator('#toggle-list-filters');

  await expect(rowHeightButton).toBeVisible();
  await expect(page.locator('#toggle-row-height')).toHaveCount(1);

  const box = async (locator: Locator) => (await locator.boundingBox())!;
  const rowHeightBox = await box(rowHeightButton);
  const filtersBox = await box(filters);
  const controlsBox = await box(controls);

  expect(Math.round(rowHeightBox.y)).toBe(Math.round(filtersBox.y));
  expect(rowHeightBox.x).toBeLessThan(filtersBox.x);
  expect(rowHeightBox.y + rowHeightBox.height).toBeLessThanOrEqual(
    controlsBox.y + controlsBox.height,
  );

  const search = await box(page.locator('.list-controls .search-input'));
  const left = await box(page.locator('.list-controls__left'));

  expect(Math.round(search.width)).toBe(Math.round(left.width));
});

test('switches row height, keeps it after reload, and Reset to default clears it with widths', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(plainList);
  await expect(page.locator('.fb-list-grid tbody tr')).toHaveCount(10);

  const initial = await rowHeight(page);

  for (const [option, height] of [
    ['Compact', initial - 16],
    ['Tall', initial + 16],
    ['Default', initial],
  ] as const) {
    await page.locator('#toggle-row-height').click();
    await page.getByRole('menuitemradio', { name: option }).click();

    await expect
      .poll(async () => Math.abs((await rowHeight(page)) - height))
      .toBeLessThanOrEqual(1);
  }

  await page.locator('#toggle-row-height').click();
  await page.getByRole('menuitemradio', { name: 'Tall' }).click();
  await drag(page, 'company', 80);
  await expect.poll(async () => (await storedPreference(page)).rowHeight).toBe('tall');
  await expect
    .poll(async () => Object.keys((await storedPreference(page)).widths ?? {}))
    .toEqual(['company']);

  const resized = await width(header(page, 'company'));

  await page.reload();
  expect(Math.abs((await rowHeight(page)) - initial - 16)).toBeLessThanOrEqual(1);
  expect(await width(header(page, 'company'))).toBe(resized);

  await page.locator('#list-menu button, #list-menu').first().click();
  await page.getByRole('menuitem', { name: 'Reset to default' }).click();
  await expect(page.locator('.fb-list-grid')).toHaveAttribute('data-row-height', 'default');
  await expect.poll(async () => Math.abs((await rowHeight(page)) - initial)).toBeLessThanOrEqual(1);
  await expect(page.locator('.fb-list-grid style', { hasText: `${resized}px` })).toHaveCount(0);
});

test('shoots resized, frozen, tall and compact lists in light and dark', async ({ page }) => {
  test.setTimeout(90_000);

  const errors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });

  await page.request.post('/api/payload-preferences/collection-contacts-view-list', {
    data: { value: { rowHeight: 'tall', widths: { name: 240, email: 320 } } },
  });

  await savePreference(page, { rowHeight: 'compact', widths: { amount: 200 } });

  const views = [
    { name: 'contacts-tall-scrolled', path: '/collections/contacts', scroll: 260 },
    { name: 'deals-grouped-compact', path: '/collections/deals?groupBy=stage', scroll: 0 },
  ];

  for (const view of views) {
    await page.goto(view.path);

    await shootView(page, view.name, {
      path: shots,
      prepare: async (shot) => {
        await shot
          .locator('.fb-list-grid .table')
          .first()
          .evaluate((element, left) => element.scrollTo({ left }), view.scroll);
      },
      waitFor: '.fb-list-grid tbody tr',
    });
  }

  expect(errors).toEqual([]);
});

const isPreferenceWrite = (request: {
  method: () => string;
  url: () => string;
  headers: () => Record<string, string>;
}) =>
  request.method() === 'POST' &&
  (request.url().endsWith(viewPreference) || 'next-action' in request.headers());

test('a width save in flight keeps a sort the URL saved meanwhile', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/collections/deals?limit=10&sort=name');
  await expect(page.locator('.fb-list-grid tbody tr')).toHaveCount(10);
  await expect.poll(async () => (await storedPreference(page)).sort).toBe('name');

  let release = () => {};

  const held = new Promise<void>((resolve) => (release = resolve));
  let posted = false;

  await page.route('**/*', async (route) => {
    if (!posted && isPreferenceWrite(route.request())) {
      posted = true;
      await held;
    }

    await route.continue();
  });

  cleanups.push(() => page.unrouteAll({ behavior: 'ignoreErrors' }));

  await drag(page, 'company', 80);
  await expect.poll(() => posted).toBe(true);
  await header(page, 'amount').getByRole('button').first().click();
  await expect(page).toHaveURL(/sort=-amount/);
  await expect.poll(async () => (await storedPreference(page)).sort).toBe('-amount');

  release();

  await expect
    .poll(async () => Object.keys((await storedPreference(page)).widths ?? {}))
    .toEqual(['company']);
  expect((await storedPreference(page)).sort).toBe('-amount');
});

test('a failed preference save never erases the saved sort, filters and summary', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  const saved = {
    sort: '-amount',
    summary: { amount: 'avg' },
    where: { stage: { equals: 'lead' } },
  };

  await savePreference(page, saved);
  await page.goto('/collections/deals');
  await expect(page.locator('.fb-list-grid tbody tr').first()).toBeVisible();

  let failed = false;

  await page.route('**/*', async (route) => {
    if (route.request().method() === 'GET' && route.request().url().endsWith(viewPreference)) {
      await route.fulfill({ json: { errors: [{ message: 'boom' }] }, status: 500 });

      return;
    }

    if (!failed && isPreferenceWrite(route.request())) {
      failed = true;
      await route.fulfill({ body: 'boom', status: 500 });

      return;
    }

    await route.continue();
  });

  cleanups.push(() => page.unrouteAll({ behavior: 'ignoreErrors' }));

  await drag(page, 'company', 80);
  await expect.poll(() => failed).toBe(true);
  const afterFailure = await storedPreference(page);

  expect(afterFailure).toMatchObject(saved);
  expect(afterFailure.widths).toBeUndefined();

  await drag(page, 'company', 40);

  await expect
    .poll(async () => Object.keys((await storedPreference(page)).widths ?? {}))
    .toEqual(['company']);
  expect(await storedPreference(page)).toMatchObject(saved);
});
