import { type BrowserContext, expect, type Locator, type Page, test } from '@playwright/test';

import { prepareView } from './__helpers/viewShots';
import { timezoneId, todayDate } from './fixtures/crm/shared';

test.use({ timezoneId });

type Task = { id: number; project?: number };

const tasks: number[] = [];
const members: { context: BrowserContext; id: number }[] = [];
const projects: number[] = [];

const panel = (page: Page) => page.locator('.fb-record-panel');
const panelBody = (page: Page) => panel(page).locator('.fb-record-panel__body');
const title = (page: Page) => page.locator('.fb-record-panel-title__input');

async function findTask(page: Page, name: string) {
  const response = await page.request.get(
    `/api/tasks?where[title][equals]=${encodeURIComponent(name)}&depth=0`,
  );

  return ((await response.json()) as { docs: Task[] }).docs[0];
}

function paragraph(text: string) {
  return {
    root: {
      type: 'root',
      children: [{ type: 'paragraph', children: [{ type: 'text', text, version: 1 }], version: 1 }],
      version: 1,
    },
  };
}

test.beforeEach(async ({ page }) => {
  await prepareView(page);
  await page.setViewportSize({ width: 1440, height: 900 });
});

test.afterEach(async ({ page }) => {
  for (const key of ['collection-tasks', 'collection-tasks-view-list']) {
    await page.request.delete(`/api/payload-preferences/${key}`);
  }

  for (const id of tasks.splice(0)) await page.request.delete(`/api/tasks/${id}`);

  for (const id of projects.splice(0)) await page.request.delete(`/api/projects/${id}`);

  for (const { context, id } of members.splice(0)) {
    await context.request.delete(`/api/comments?where[author][equals]=${id}`);
    await context.close();
    await page.request.delete(`/api/users/${id}`);
  }
});

test('a subtask opened from a scrolled parent shows its title at the top', async ({ page }) => {
  const parent = await findTask(page, 'Design the pricing page');

  await page.setViewportSize({ width: 1440, height: 600 });
  await page.goto(`/collections/tasks?record=${parent.id}`);
  await expect(title(page)).toHaveValue('Design the pricing page');

  const subtask = panel(page).locator('.fb-panel-join__title', {
    hasText: 'Write the pricing FAQ',
  });

  await subtask.scrollIntoViewIfNeeded();
  await expect(title(page)).not.toBeInViewport();
  expect(await panelBody(page).evaluate((body) => body.scrollTop)).toBeGreaterThan(0);

  await subtask.click();
  await expect(title(page)).toHaveValue('Write the pricing FAQ');
  await expect.poll(() => panelBody(page).evaluate((body) => body.scrollTop)).toBe(0);
  await expect(title(page)).toBeInViewport();
});

test('the board hides the empty no-value column, and shows it for a card with no status', async ({
  page,
}) => {
  await page.goto('/collections/tasks/board');

  const columns = page.locator('.frog-board__column');
  const noValue = columns.filter({ hasText: 'Uncategorized' });

  await expect(columns.filter({ hasText: 'Done' })).toHaveCount(1);
  await expect(noValue).toHaveCount(0);

  const parent = await findTask(page, 'Design the pricing page');
  const response = await page.request.post('/api/tasks', {
    data: { project: parent.project, status: null, title: 'Triage the inbox' },
  });

  tasks.push(((await response.json()) as { doc: Task }).doc.id);

  await page.reload();
  await expect(noValue).toHaveCount(1);
  await expect(noValue.locator('.frog-board__card')).toHaveText([/Triage the inbox/]);
});

test('list rows stay on one line with the panel open, and the table scrolls sideways', async ({
  page,
}) => {
  const task = await findTask(page, 'Design the pricing page');

  await page.goto(`/collections/tasks?record=${task.id}`);
  await expect(title(page)).toHaveValue('Design the pricing page');

  const rows = page.locator('.collection-view--list tbody > tr');
  const heights = await rows.evaluateAll((all) =>
    all.map((row) => Math.round(row.getBoundingClientRect().height)),
  );

  expect(heights.length).toBeGreaterThan(5);
  expect(Math.max(...heights)).toBeLessThan(56);
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);

  const clipped = await page
    .locator('.collection-view--list thead th')
    .evaluateAll((headers) =>
      headers
        .filter(
          (header) => header.textContent?.trim() && header.scrollWidth > header.clientWidth + 1,
        )
        .map((header) => header.textContent),
    );

  expect(clipped).toEqual([]);

  const titleCell = page.locator('.collection-view--list tbody td.cell-title').first();

  expect((await titleCell.boundingBox())!.width).toBeGreaterThanOrEqual(200);
});

test('the board toolbar’s Sort pill fits its label at 760px', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 900 });
  await page.goto('/collections/tasks/board');

  const sort = page.locator('.list-controls__toggle-sort');

  await expect(sort).toBeVisible();
  expect((await sort.boundingBox())!.width).toBeLessThan(120);
});

test('timeline bars are never slivers or empty, and inside labels end in an ellipsis', async ({
  page,
}) => {
  await page.goto(`/collections/tasks/timeline?date=${todayDate}&scale=month`);
  await expect(page.locator('.frog-timeline__bar')).toHaveCount(12);
  await expect(page.locator('.frog-timeline__bar[data-label-outside]').first()).toBeVisible();

  const bars = await page.locator('.frog-timeline__bar').evaluateAll((all) =>
    all.map((bar) => {
      const box = bar.getBoundingClientRect();
      const text = bar.querySelector<HTMLElement>('.collection-timeline__title-text')!;
      const textBox = text.getBoundingClientRect();

      return {
        background: getComputedStyle(bar).backgroundColor,
        done: bar.classList.contains('fb-record--done'),
        ellipsis: getComputedStyle(text).textOverflow,
        outside: Boolean((bar as HTMLElement).dataset.labelOutside),
        overflowsBar: textBox.right > box.right + 1,
        title: text.textContent,
        truncated: text.scrollWidth > text.clientWidth,
        width: box.width,
      };
    }),
  );

  const inside = bars.filter((bar) => !bar.outside);
  const outside = bars.filter((bar) => bar.outside);
  const plain = inside[0].background;

  expect(bars.filter((bar) => bar.width < 20).map((bar) => bar.title)).toEqual([]);
  expect(outside.some((bar) => bar.done)).toBe(true);
  expect(outside.filter((bar) => bar.background === plain).map((bar) => bar.title)).toEqual([]);
  expect(inside.filter((bar) => bar.overflowsBar).map((bar) => bar.title)).toEqual([]);
  expect(inside.some((bar) => bar.truncated)).toBe(true);

  for (const bar of inside.filter(({ truncated }) => truncated)) {
    expect(bar.ellipsis).toBe('ellipsis');
  }
});

test('a comment by a user named only by their email shows a name, not the raw email', async ({
  browser,
  page,
}) => {
  const task = await findTask(page, 'Design the pricing page');
  const email = `riley-${Date.now()}@example.com`;
  const created = await page.request.post('/api/users', {
    data: { email, password: 'frogbot-test', roles: ['member'] },
  });

  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const member = await context.newPage();

  members.push({ context, id: ((await created.json()) as { doc: { id: number } }).doc.id });

  await member.request.post('/api/users/login', { data: { email, password: 'frogbot-test' } });

  const posted = await member.request.post('/api/comments', {
    data: {
      body: paragraph('Looks good to me.'),
      collection: 'tasks',
      documentId: String(task.id),
    },
  });

  expect(posted.ok()).toBe(true);

  await page.goto(`/collections/tasks?record=${task.id}`);

  const comment = panel(page).locator('.fb-comments__item', { hasText: 'Looks good to me.' });

  await expect(comment.locator('.fb-comments__meta strong')).toHaveText(email.split('@')[0]);
  await expect(comment).not.toContainText('@');
});

test('list rows show the done circle, and the selection box only on hover or selection', async ({
  page,
}) => {
  await page.goto('/collections/tasks');

  const rows = page.locator('.collection-view--list tbody > tr');
  const first = rows.first();
  const second = rows.nth(1);
  const box = (row: typeof first) => row.locator('td.cell-_select .select-row');

  await expect(first.locator('td.cell-title .fb-done-check')).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(box(first)).toHaveCSS('opacity', '0');

  await first.hover();
  await expect(box(first)).toHaveCSS('opacity', '1');
  await expect(box(second)).toHaveCSS('opacity', '0');

  await box(first).locator('input').check();
  await page.mouse.move(0, 0);
  await expect(box(first)).toHaveCSS('opacity', '1');
  await expect(box(second)).toHaveCSS('opacity', '1');

  await box(first).locator('input').uncheck();
});

test('a long title in a grouped list ends in an ellipsis, not a lone “…”', async ({ page }) => {
  const parent = await findTask(page, 'Design the pricing page');
  const name = 'Write the onboarding checklist for every new enterprise customer we sign';
  const response = await page.request.post('/api/tasks', {
    data: { project: parent.project, status: 'todo', title: name },
  });

  tasks.push(((await response.json()) as { doc: Task }).doc.id);

  await page.goto('/collections/tasks?groupBy=status');
  await expect(page.locator('.fb-list-grid .table table')).not.toHaveCount(1);

  const link = page
    .locator('.collection-view--list tbody > tr', { hasText: name })
    .locator('td.cell-title > :not(.fb-list-done)');

  const shown = () =>
    link.evaluate((element) => {
      const cell = element.parentElement!.getBoundingClientRect();
      const box = element.getBoundingClientRect();

      return {
        ellipsis: getComputedStyle(element).textOverflow,
        inside: box.right <= cell.right + 1,
        truncated: element.scrollWidth > element.clientWidth,
        wide: box.width > 100,
      };
    });

  await expect
    .poll(shown)
    .toEqual({ ellipsis: 'ellipsis', inside: true, truncated: true, wide: true });
});

test('a column resized narrower than its text clips it instead of running over the next one', async ({
  page,
}) => {
  await page.request.post('/api/payload-preferences/collection-tasks-view-list', {
    data: { value: { widths: { title: 160 } } },
  });

  await page.goto('/collections/tasks');

  const cell = page
    .locator('.collection-view--list tbody > tr', { hasText: 'Set up redirects from the old URLs' })
    .locator('td.cell-title');

  const shown = await cell.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const next = element.nextElementSibling!.getBoundingClientRect();
    const text = element.querySelector<HTMLElement>(':scope > :not(.fb-list-done)')!;

    return {
      clipped: getComputedStyle(element).overflowX === 'hidden',
      ellipsis: getComputedStyle(text).textOverflow,
      textInside: text.getBoundingClientRect().right <= next.left + 1,
      width: Math.round(box.width),
    };
  });

  expect(shown).toMatchObject({
    clipped: true,
    ellipsis: 'ellipsis',
    textInside: true,
    width: 160,
  });
});

test('selecting a row in one group shows every group’s selection boxes', async ({ page }) => {
  await page.goto('/collections/tasks?groupBy=status');

  const groups = page.locator('.fb-list-grid .table');

  await expect(groups).not.toHaveCount(1);

  const box = (group: number) =>
    groups.nth(group).locator('tbody > tr').first().locator('td.cell-_select .select-row');

  await page.mouse.move(0, 0);
  await expect(box(1)).toHaveCSS('opacity', '0');

  await box(0).locator('input').check();
  await page.mouse.move(0, 0);
  await expect(box(1)).toHaveCSS('opacity', '1');

  await box(0).locator('input').uncheck();
});

test('saving a new record from the panel’s create form keeps its scroll position', async ({
  page,
}) => {
  const parent = await findTask(page, 'Design the pricing page');
  const name = `Panel create ${Date.now()}`;
  const scrollTop = () => panelBody(page).evaluate((body) => body.scrollTop);

  await page.setViewportSize({ width: 1280, height: 360 });
  await page.goto(`/collections/tasks?record=${parent.id}`);
  await expect(title(page)).toHaveValue('Design the pricing page');
  await panel(page).getByRole('button', { name: 'More options' }).click();
  await page.locator('#action-panel-create').click();
  await expect(title(page)).toHaveValue('');
  await title(page).fill(name);
  await panel(page).getByRole('combobox', { name: 'Project' }).click();
  await page.locator('.rs__option').first().click();
  await panelBody(page).evaluate((body) => body.scrollTo({ top: 200 }));
  await expect.poll(scrollTop).toBe(200);

  const before = await scrollTop();

  await page.locator('.fb-record-panel-header__save').click();

  await expect
    .poll(() => new URL(page.url()).searchParams.get('record'), { timeout: 10_000 })
    .not.toBeNull();

  tasks.push((await findTask(page, name)).id);
  await expect(panel(page).getByRole('button', { name: 'Mark complete' })).toBeVisible();
  await expect(title(page)).toHaveValue(name);

  expect(await scrollTop()).toBe(before);
});

test('one-day bars on consecutive days at month scale neither overlap nor get crossed by a label', async ({
  page,
}) => {
  const stamp = Date.now();
  const project = await page.request.post('/api/projects', {
    data: { key: `BK${stamp % 100000}`, name: `Changelogs ${stamp}` },
  });

  projects.push(((await project.json()) as { doc: { id: number } }).doc.id);

  const day = (offset: number) => {
    const date = new Date(`${todayDate}T12:00:00Z`);

    date.setUTCDate(date.getUTCDate() + offset);

    return date.toISOString();
  };

  for (const [offset, name] of [
    [3, 'Ship the first changelog'],
    [4, 'Ship the second changelog'],
  ] as const) {
    const response = await page.request.post('/api/tasks', {
      data: { dueDate: day(offset), project: projects[0], startDate: day(offset), title: name },
    });

    tasks.push(((await response.json()) as { doc: Task }).doc.id);
  }

  await page.goto(`/collections/tasks/timeline?date=${todayDate}&scale=month`);

  const bars = page.locator('.frog-timeline__bar', {
    hasText: /Ship the (first|second) changelog/,
  });

  await expect(bars).toHaveCount(2);

  const shown = await bars.evaluateAll((all) => {
    const [a, b] = all.map((bar) => ({
      box: bar.getBoundingClientRect(),
      label: bar.querySelector('.frog-timeline__bar-content')!.getBoundingClientRect(),
      outside: Boolean((bar as HTMLElement).dataset.labelOutside),
    }));

    const sameRow = Math.abs(a.box.y - b.box.y) < 1;
    const hits = (box: DOMRect, other: DOMRect) =>
      sameRow && box.x < other.right - 1 && box.right > other.x + 1;

    return {
      barsOverlap: hits(a.box, b.box),
      firstLabelCrossesSecond: a.outside && hits(a.label, b.box),
      secondLabelCrossesFirst: b.outside && hits(b.label, a.box),
    };
  });

  expect(shown).toEqual({
    barsOverlap: false,
    firstLabelCrossesSecond: false,
    secondLabelCrossesFirst: false,
  });
});

async function headerFits(header: Locator) {
  return header.evaluate((th) => {
    const box = th.getBoundingClientRect();
    const next = th.nextElementSibling?.getBoundingClientRect();
    const walker = document.createTreeWalker(th, NodeFilter.SHOW_TEXT);
    let text = 0;

    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;

      let clip = Infinity;

      for (let element = node.parentElement; element; element = element.parentElement) {
        if (getComputedStyle(element).overflowX !== 'visible') {
          clip = Math.min(clip, element.getBoundingClientRect().right);
        }

        if (element === th) break;
      }

      const range = document.createRange();

      range.selectNodeContents(node);

      for (const rect of range.getClientRects()) text = Math.max(text, Math.min(rect.right, clip));
    }

    return {
      textBeforeNext: next ? text <= next.left + 1 : true,
      textInside: text <= box.right + 1,
    };
  });
}

for (const grouped of [false, true]) {
  test(`${grouped ? 'a grouped' : 'an ungrouped'} list header resized to the minimum stays inside its column`, async ({
    page,
  }) => {
    await page.request.post('/api/payload-preferences/collection-tasks-view-list', {
      data: { value: { widths: { dueDate: 60 } } },
    });

    await page.goto(`/collections/tasks${grouped ? '?groupBy=status' : ''}`);

    const header = page.locator('.collection-view--list thead th', { hasText: 'Due Date' }).first();

    await expect(header).toBeVisible();
    expect(await headerFits(header)).toEqual({ textBeforeNext: true, textInside: true });
  });
}
