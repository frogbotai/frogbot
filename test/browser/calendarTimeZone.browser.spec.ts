import { expect, type Locator, type Page, test, type TestInfo } from '@playwright/test';

import { tasksSlug } from './fixtures/question/shared';

const hourHeight = 56;
const now = '2026-09-08T21:30:00.000Z';
const calendar = (mode: string) => `/collections/${tasksSlug}/calendar?mode=${mode}&date=${now}`;

const tasks = {
  standup: {
    title: 'Standup',
    dueAt: '2026-09-08T16:00:00.000Z',
    endsAt: '2026-09-08T16:30:00.000Z',
  },
  evening: {
    title: 'Evening review',
    dueAt: '2026-09-09T02:00:00.000Z',
    endsAt: '2026-09-09T03:00:00.000Z',
  },
  overnight: {
    title: 'Night deploy',
    dueAt: '2026-09-10T05:00:00.000Z',
    endsAt: '2026-09-10T11:00:00.000Z',
  },
  late: {
    title: 'Late call',
    dueAt: '2026-09-08T05:00:00.000Z',
    endsAt: '2026-09-08T07:00:00.000Z',
  },
  planning: {
    title: 'Planning',
    dueAt: '2026-09-08T21:00:00.000Z',
    endsAt: '2026-09-08T22:00:00.000Z',
  },
  ...Object.fromEntries(
    [1, 2, 3, 4].map((index) => [
      `busy${index}`,
      {
        title: `Busy ${index}`,
        dueAt: '2026-09-11T17:00:00.000Z',
        endsAt: '2026-09-11T18:00:00.000Z',
      },
    ]),
  ),
};

const tall = { height: 2600, width: 1280 };
const ids: Record<string, string> = {};
let problems: string[];

test.use({ timezoneId: 'America/Los_Angeles' });

async function attach(page: Page, testInfo: TestInfo, name: string, widths?: number[]) {
  const shoot = async (label: string) => {
    const file = testInfo.outputPath(`${label}.png`);

    await page.screenshot({ path: file });
    await testInfo.attach(label, { path: file, contentType: 'image/png' });
  };

  if (!widths) return shoot(name);
  const size = page.viewportSize() ?? { height: 900, width: 1280 };

  for (const width of widths) {
    await page.setViewportSize({ height: size.height, width });
    await shoot(`${name}-${width}`);
  }

  await page.setViewportSize(size);
}

const chip = (page: Page, title: string) =>
  page.locator('.frog-calendar__event', { has: page.getByText(title, { exact: true }) });

async function columnIndex(event: Locator) {
  return event.evaluate((element) => {
    const column = element.closest('.frog-calendar__day-column');

    return [...document.querySelectorAll('.frog-calendar__day-column')].indexOf(column as Element);
  });
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();

  if (!box) throw new Error('missing calendar box');

  return box;
}

async function task(page: Page, key: string) {
  const response = await page.request.get(`/api/${tasksSlug}/${ids[key]}`);

  return (await response.json()) as { dueAt: string; endsAt: string };
}

test.beforeEach(async ({ page }) => {
  problems = [];

  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });

  page.on('pageerror', (error) => problems.push(error.message));

  page.on('requestfailed', (request) => {
    if (request.failure()?.errorText !== 'net::ERR_ABORTED') problems.push(request.url());
  });

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

test('week view places events, overnight events and the now line in Los Angeles time', async ({
  page,
}, testInfo) => {
  await page.goto(calendar('week'));

  const evening = chip(page, tasks.evening.title);

  await expect(evening).toBeVisible();
  expect(await columnIndex(evening)).toBe(2);
  await expect(evening).toHaveCSS('top', `${19 * hourHeight}px`);
  await expect(chip(page, tasks.overnight.title)).toHaveCount(2);
  expect(await columnIndex(chip(page, tasks.overnight.title).first())).toBe(3);
  expect(await columnIndex(chip(page, tasks.overnight.title).last())).toBe(4);
  await expect(page.locator('.frog-calendar__now')).toHaveCount(1);
  expect(
    await page
      .locator('.frog-calendar__now')
      .evaluate((line) =>
        [...document.querySelectorAll('.frog-calendar__day-column')].indexOf(
          line.closest('.frog-calendar__day-column') as Element,
        ),
      ),
  ).toBe(2);

  for (const [name, hour] of [
    ['week-night', 0],
    ['week-evening', 16],
    ['week', 8],
  ] as const) {
    await page.locator('.frog-calendar__time-scroll').evaluate((scroll, top) => {
      scroll.scrollTop = top;
    }, hour * hourHeight);

    await attach(page, testInfo, name, name === 'week' ? [1280, 375] : [1280]);
  }
});

test('plain date fields keep their time, and an event ending at midnight stays in its day', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ height: 1500, width: 1280 });
  await page.goto(calendar('week'));

  const late = chip(page, tasks.late.title);

  await expect(late).toBeVisible();
  await attach(page, testInfo, 'week-midnight', [1280, 375]);

  await expect(page.locator('.frog-calendar__all-day-cell .frog-calendar__event')).toHaveCount(0);
  await expect(late).toHaveCount(1);
  expect(await columnIndex(late)).toBe(1);
  await expect(late).toHaveCSS('top', `${22 * hourHeight}px`);
  await expect(late).toHaveCSS('height', `${2 * hourHeight}px`);

  await page.goto(calendar('day'));
  await expect(chip(page, tasks.standup.title)).toBeVisible();
  await attach(page, testInfo, 'day-midnight', [1280, 375]);
  await expect(late).toHaveCount(0);
});

test('day view shows the local day', async ({ page }, testInfo) => {
  await page.goto(calendar('day'));

  await expect(page.locator('.frog-calendar__header strong')).toHaveText(
    'Tuesday, September 8, 2026',
  );
  await expect(chip(page, tasks.evening.title)).toHaveCSS('top', `${19 * hourHeight}px`);
  await expect(chip(page, tasks.standup.title)).toHaveCSS('top', `${9 * hourHeight}px`);

  await page.locator('.frog-calendar__time-scroll').evaluate((scroll) => {
    scroll.scrollTop = 8 * 56;
  });

  await attach(page, testInfo, 'day', [1280, 375]);
});

test('a month drag keeps the time of day', async ({ page }, testInfo) => {
  await page.setViewportSize(tall);
  await page.goto(calendar('month'));

  const planning = chip(page, tasks.planning.title);
  const target = page
    .locator('.frog-calendar__month-cell', {
      has: page.locator('.frog-calendar__month-date', { hasText: /^10$/ }),
    })
    .first();

  const from = await boxOf(planning);
  const to = await boxOf(target);

  await page.mouse.move(from.x + 10, from.y + 5);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await expect(page.locator('.frog-calendar__month-cell--placing')).toHaveCount(1);
  await attach(page, testInfo, 'month-drag');
  await page.mouse.up();

  await expect
    .poll(() => task(page, 'planning'))
    .toMatchObject({
      dueAt: '2026-09-10T21:00:00.000Z',
      endsAt: '2026-09-10T22:00:00.000Z',
    });
});

test('a resize previews while dragging and saves the new end', async ({ page }, testInfo) => {
  await page.goto(calendar('week'));

  await page.locator('.frog-calendar__time-scroll').evaluate((scroll) => {
    scroll.scrollTop = 8 * 56;
  });

  const standup = chip(page, tasks.standup.title);
  const handle = standup.getByLabel('Resize end');
  const box = await boxOf(handle);

  await standup.hover();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 2 * hourHeight, { steps: 8 });
  await expect(standup).toHaveCSS('height', `${2.5 * hourHeight}px`);
  await attach(page, testInfo, 'resize-preview');
  await page.mouse.up();

  await expect
    .poll(() => task(page, 'standup'))
    .toMatchObject({
      dueAt: tasks.standup.dueAt,
      endsAt: '2026-09-08T18:30:00.000Z',
    });
});

test('"+N more" opens the whole day', async ({ page }, testInfo) => {
  await page.setViewportSize(tall);
  await page.goto(calendar('month'));

  const more = page.getByRole('button', { name: '+1 more' });

  await more.focus();
  await page.keyboard.press('Enter');

  const list = page.getByRole('dialog');

  await expect(list.locator('.frog-calendar__event')).toHaveCount(4);
  await attach(page, testInfo, 'more');
  await page.keyboard.press('Escape');
  await expect(list).toHaveCount(0);
});
