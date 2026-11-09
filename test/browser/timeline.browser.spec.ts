import { expect, type Locator, type Page, test, type TestInfo } from '@playwright/test';

import { tasksSlug } from './fixtures/question/shared';

const now = '2026-09-08T21:30:00.000Z';
const DAY = 86_400_000;
const timeline = (scale = 'day') => `/collections/${tasksSlug}/timeline?scale=${scale}&date=${now}`;

const calendar = `/collections/${tasksSlug}/calendar?mode=week&date=${now}`;

const tasks = {
  plan: {
    status: 'backlog',
    title: 'Plan the launch',
    dueAt: '2026-09-08T16:00:00.000Z',
    endsAt: '2026-09-10T18:00:00.000Z',
  },
  evening: {
    title: 'Evening review',
    dueAt: '2026-09-09T02:00:00.000Z',
    endsAt: '2026-09-09T03:00:00.000Z',
  },
  dueOnly: { status: 'done', title: 'Ship the notes', endsAt: '2026-09-12T18:00:00.000Z' },
};

const ids: Record<string, string> = {};
let problems: string[];

const bar = (page: Page, title: string) =>
  page.locator('.frog-timeline__bar', { has: page.getByText(title, { exact: true }) });

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();

  if (!box) throw new Error('missing timeline box');

  return box;
}

async function dayWidth(page: Page) {
  return page
    .locator('.frog-timeline__track')
    .first()
    .evaluate((track) => track.getBoundingClientRect().width / 14);
}

async function dayOf(page: Page, title: string) {
  const track = await boxOf(page.locator('.frog-timeline__track').first());
  const box = await boxOf(bar(page, title));

  return Math.floor((box.x - track.x + 4) / (track.width / 14));
}

async function calendarColumn(page: Page, title: string) {
  return page
    .locator('.frog-calendar__event', { has: page.getByText(title, { exact: true }) })
    .first()
    .evaluate((element) => {
      const selector = element.closest('.frog-calendar__all-day-cell')
        ? '.frog-calendar__all-day-cell'
        : '.frog-calendar__day-column';

      return [...document.querySelectorAll(selector)].indexOf(element.closest(selector) as Element);
    });
}

async function task(page: Page, key: string) {
  const response = await page.request.get(`/api/${tasksSlug}/${ids[key]}`);

  return (await response.json()) as { dueAt?: string | null; endsAt?: string | null };
}

async function shoot(page: Page, testInfo: TestInfo, name: string) {
  const file = testInfo.outputPath(`${name}.png`);

  await page.screenshot({ path: file });
  await testInfo.attach(name, { path: file, contentType: 'image/png' });
}

async function dragBy(page: Page, x: number, y: number, dx: number) {
  await page.mouse.move(x, y);
  await page.mouse.down();

  for (const step of [0.25, 0.5, 0.75, 1]) await page.mouse.move(x + dx * step, y);

  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  problems = [];

  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });

  page.on('pageerror', (error) => problems.push(error.message));

  page.on('response', (response) => {
    if (response.status() >= 400) problems.push(`${response.status()} ${response.url()}`);
  });

  await page.route('https://www.gravatar.com/**', (route) => route.fulfill({ status: 204 }));
  await page.clock.setFixedTime(now);
  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);

  for (const [key, data] of Object.entries(tasks)) {
    const response = await page.request.post(`/api/${tasksSlug}`, { data });

    expect(response.ok()).toBe(true);
    ids[key] = String(((await response.json()) as { doc: { id: string } }).doc.id);
  }
});

test.afterEach(async ({ page }) => {
  expect(problems).toEqual([]);
  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
});

for (const { timezoneId, evening } of [
  { timezoneId: 'America/Los_Angeles', evening: 2 },
  { timezoneId: 'Asia/Tokyo', evening: 3 },
]) {
  test.describe(timezoneId, () => {
    test.use({ timezoneId });

    test('bars land on the same days as the calendar', async ({ page }, testInfo) => {
      await page.goto(timeline());
      await expect(bar(page, tasks.evening.title)).toBeVisible();
      expect(await dayOf(page, tasks.evening.title)).toBe(evening);

      const timelineDays = {
        evening: await dayOf(page, tasks.evening.title),
        plan: await dayOf(page, tasks.plan.title),
      };

      await shoot(page, testInfo, `timeline-${timezoneId.replace('/', '-')}`);

      await page.goto(calendar);
      await expect(page.locator('.frog-calendar__day-column').first()).toBeVisible();

      expect({
        evening: await calendarColumn(page, tasks.evening.title),
        plan: await calendarColumn(page, tasks.plan.title),
      }).toEqual(timelineDays);
    });
  });
}

test.describe('editing', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test('groups by status and shows a due-only record as one day', async ({ page }) => {
    await page.goto(timeline());

    await expect(page.locator('.frog-timeline__band-label')).toHaveText([
      'Backlog',
      'Done',
      'No value',
    ]);

    const due = await boxOf(bar(page, tasks.dueOnly.title));

    expect(Math.round(due.width / (await dayWidth(page)))).toBe(1);
    expect(await dayOf(page, tasks.dueOnly.title)).toBe(6);
  });

  test('a drag moves both dates three days and survives a reload', async ({ page }, testInfo) => {
    await page.setViewportSize({ height: 900, width: 1280 });
    await page.goto(timeline());

    const plan = bar(page, tasks.plan.title);
    const box = await boxOf(plan);
    const width = await dayWidth(page);

    await dragBy(page, box.x + box.width / 2, box.y + box.height / 2, width * 3);

    await expect
      .poll(async () => (await task(page, 'plan')).dueAt)
      .toBe(new Date(Date.parse(tasks.plan.dueAt) + 3 * DAY).toISOString());

    expect((await task(page, 'plan')).endsAt).toBe(
      new Date(Date.parse(tasks.plan.endsAt) + 3 * DAY).toISOString(),
    );

    await page.reload();
    await expect(plan).toBeVisible();
    expect(await dayOf(page, tasks.plan.title)).toBe(5);
    await expect(page).not.toHaveURL(/record=/);
    await shoot(page, testInfo, 'timeline-moved');
  });

  test('dragging the right edge changes only the end', async ({ page }) => {
    await page.goto(timeline());

    const plan = bar(page, tasks.plan.title);

    await plan.hover();

    const handle = await boxOf(plan.getByLabel('Change end date'));
    const width = await dayWidth(page);

    await dragBy(page, handle.x + handle.width / 2, handle.y + handle.height / 2, width);

    await expect
      .poll(async () => (await task(page, 'plan')).endsAt)
      .toBe(new Date(Date.parse(tasks.plan.endsAt) + DAY).toISOString());

    expect((await task(page, 'plan')).dueAt).toBe(tasks.plan.dueAt);

    await page.reload();
    expect(Math.round((await boxOf(plan)).width / width)).toBe(4);
  });

  test('dragging a due-only record’s free edge fills in its start', async ({ page }) => {
    await page.goto(timeline());

    const due = bar(page, tasks.dueOnly.title);

    await due.hover();

    const handle = await boxOf(due.getByLabel('Change start date'));

    await dragBy(
      page,
      handle.x + handle.width / 2,
      handle.y + handle.height / 2,
      -2 * (await dayWidth(page)),
    );

    await expect
      .poll(async () => (await task(page, 'dueOnly')).dueAt)
      .toBe(new Date(Date.parse(tasks.dueOnly.endsAt) - 2 * DAY).toISOString());

    expect((await task(page, 'dueOnly')).endsAt).toBe(tasks.dueOnly.endsAt);
  });

  test('clicking a bar opens the record panel', async ({ page }) => {
    await page.goto(timeline());
    await bar(page, tasks.evening.title).click();

    await expect(page).toHaveURL(new RegExp(`record=${ids.evening}`));
    await expect(page.locator('.fb-record-panel')).toBeVisible();
    await expect(bar(page, tasks.evening.title)).toHaveClass(/fb-record--selected/);
  });

  test('switches scale and steps through time from the header', async ({ page }) => {
    await page.goto(timeline());
    await expect(page.locator('.frog-calendar__header strong')).toHaveText('Sep 6 – Sep 19, 2026');

    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.locator('.frog-calendar__header strong')).toHaveText('Sep 13 – Sep 26, 2026');
    await expect(bar(page, tasks.plan.title)).toHaveCount(0);
    await expect(bar(page, tasks.dueOnly.title)).toHaveCount(0);

    await page.getByRole('button', { name: 'month' }).click();
    await expect(page).toHaveURL(/scale=month/);
    await expect(page.locator('.frog-calendar__header strong')).toHaveText('Sep 1 – Nov 30, 2026');

    await page.getByRole('button', { name: 'Today' }).click();
    await expect(page).toHaveURL(/date=2026-09-08/);

    await expect(async () => {
      await page.goto(`/collections/${tasksSlug}/timeline`);

      await expect(page.locator('.frog-calendar__header strong')).toHaveText(
        'Sep 1 – Nov 30, 2026',
        { timeout: 1_000 },
      );
    }).toPass();
  });

  test('at 390px the track scrolls inside the view and band names stay pinned', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto(timeline('week'));
    await expect(bar(page, tasks.plan.title)).toBeVisible();

    const scroll = page.locator('.frog-timeline__scroll');
    const label = page.locator('.frog-timeline__band-label').first();
    const before = await boxOf(label);

    expect(await scroll.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
      true,
    );

    await scroll.evaluate((element) => {
      element.scrollLeft = 400;
    });

    expect(await scroll.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    expect((await boxOf(label)).x).toBe(before.x);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);

    await shoot(page, testInfo, 'timeline-390');
  });
});
