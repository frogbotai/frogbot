import { expect, type Locator, type Page, test } from '@playwright/test';

import { aiFieldName, aiFieldPath, tasksSlug } from './fixtures/question/shared';

type ID = number | string;

type AIState = {
  status: 'pending' | 'done' | 'error' | 'manual' | null;
  value?: string | null;
  error?: string | null;
};

type TaskData = { title: string; notes?: string; status?: string };

const statusPath = `_${aiFieldName}_status`;

const listPath = `/collections/${tasksSlug}?columns=${encodeURIComponent(
  JSON.stringify(['title', aiFieldName]),
)}`;

async function createTask(page: Page, data: TaskData): Promise<ID> {
  const response = await page.request.post(`/api/${tasksSlug}`, { data });

  expect(response.ok()).toBe(true);

  return (await response.json()).doc.id;
}

async function setState(page: Page, id: ID, state: AIState): Promise<void> {
  const response = await page.request.post(`/api${aiFieldPath}`, { data: { id, ...state } });

  expect(response.ok()).toBe(true);
}

async function storedTask(page: Page, id: ID): Promise<Record<string, unknown>> {
  const response = await page.request.get(`/api/${tasksSlug}/${id}?depth=0`);

  expect(response.ok()).toBe(true);

  return response.json();
}

async function expectStoredStatus(page: Page, id: ID, status: string): Promise<void> {
  expect((await storedTask(page, id))[statusPath]).toBe(status);
}

function listCell(page: Page, title: string): Locator {
  return page
    .locator('tr', { has: page.locator('td.cell-title', { hasText: new RegExp(`^${title}$`) }) })
    .locator(`td.cell-${aiFieldName}`);
}

function boardSummary(page: Page, title: string): Locator {
  return page.locator('.frog-board__card', { hasText: title }).locator('.collection-board__field', {
    has: page.locator('.collection-board__field-label', { hasText: /^Summary$/ }),
  });
}

function statusLine(page: Page): Locator {
  return page.locator('.ai-field__status');
}

test.beforeEach(async ({ page }) => {
  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
});

test.afterEach(async ({ page }) => {
  expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
});

test('a List cell that never ran shows Generate, and clicking it starts a run', async ({
  page,
}) => {
  const id = await createTask(page, { title: 'Order toner', notes: 'Two boxes, black only' });

  await setState(page, id, { status: null });
  await page.goto(listPath);

  const cell = listCell(page, 'Order toner');

  await cell.getByRole('button', { name: 'Generate' }).click();

  await expect(cell.getByRole('img', { name: 'Generating' })).toBeVisible();
  await expect(cell.getByRole('button', { name: 'Generate' })).toHaveCount(0);
  await expectStoredStatus(page, id, 'pending');
});

test('a List cell with empty inputs shows nothing', async ({ page }) => {
  await createTask(page, { title: 'Order toner' });
  await page.goto(listPath);

  const cell = listCell(page, 'Order toner');

  await expect(cell).toBeVisible();
  await expect(cell).toHaveText('');
  await expect(cell.getByRole('button')).toHaveCount(0);
});

test('a pending List cell shows the result without a reload', async ({ page }) => {
  const id = await createTask(page, { title: 'Ship the order', notes: 'Courier picks up Friday' });

  await page.goto(listPath);

  const cell = listCell(page, 'Ship the order');

  await expect(cell.locator('.ai-cell--pending')).toBeVisible();
  await expect(cell.getByRole('img', { name: 'Generating' })).toBeVisible();

  await page.evaluate(() => {
    (window as unknown as { __aiMarker: number }).__aiMarker = 1;
  });
  await setState(page, id, { status: 'done', value: 'Ships on Friday.' });

  await expect(cell).toHaveText('Ships on Friday.', { timeout: 10_000 });
  await expect(cell.getByRole('img', { name: 'Generating' })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __aiMarker?: number }).__aiMarker)).toBe(
    1,
  );
});

test('a done List cell reveals Regenerate on hover, and clicking it starts a run', async ({
  page,
}) => {
  const id = await createTask(page, { title: 'Ship the order', notes: 'Courier picks up Friday' });

  await setState(page, id, { status: 'done', value: 'Ships on Friday.' });
  await page.goto(listPath);

  const cell = listCell(page, 'Ship the order');
  const regenerate = cell.getByRole('button', { name: 'Regenerate' });

  await expect(cell).toHaveText('Ships on Friday.');
  await expect(regenerate).toHaveCSS('opacity', '0');

  await cell.getByText('Ships on Friday.').hover();

  await expect(regenerate).toHaveCSS('opacity', '1');

  await regenerate.click();

  await expect(cell.getByRole('img', { name: 'Generating' })).toBeVisible();
  await expectStoredStatus(page, id, 'pending');
});

test('a failed List cell shows the message on hover, and clicking it retries', async ({ page }) => {
  const id = await createTask(page, { title: 'Ship the order', notes: 'Courier picks up Friday' });

  await setState(page, id, { status: 'error', error: 'Model refused' });
  await page.goto(listPath);

  const cell = listCell(page, 'Ship the order');
  const retry = cell.getByRole('button', { name: 'Retry' });

  await retry.hover();

  await expect(page.getByRole('tooltip')).toHaveText('Model refused');

  await retry.click();

  await expect(cell.getByRole('img', { name: 'Generating' })).toBeVisible();
  await expectStoredStatus(page, id, 'pending');
});

test('Board cards show the AI value with no actions', async ({ page }) => {
  const tasks = [
    { title: 'Done task', state: { status: 'done', value: 'All set.' } },
    { title: 'Pending task', state: { status: 'pending', value: 'Old summary.' } },
    { title: 'Failed task', state: { status: 'error', value: 'Kept summary.', error: 'Nope' } },
  ] as const;

  for (const { title, state } of tasks) {
    const id = await createTask(page, { title, status: 'backlog' });

    await setState(page, id, state);
  }

  await page.goto(`/collections/${tasksSlug}/board`);

  const done = boardSummary(page, 'Done task');
  const pending = boardSummary(page, 'Pending task');
  const failed = boardSummary(page, 'Failed task');

  await expect(done).toContainText('All set.');
  await expect(done.locator('.ai-cell--pending')).toHaveCount(0);

  await expect(pending).toContainText('Old summary.');
  await expect(pending.locator('.ai-cell--pending')).toBeVisible();
  await expect(pending.getByRole('img', { name: 'Generating' })).toHaveCount(0);

  await expect(failed).toContainText('Kept summary.');
  await expect(failed.getByRole('img', { name: 'Nope' })).toBeVisible();

  for (const card of [done, pending, failed]) {
    await expect(card.getByRole('button')).toHaveCount(0);
  }
});

test('the edit view shows the line for each state', async ({ page }) => {
  const id = await createTask(page, { title: 'Ship the order', notes: 'Courier picks up Friday' });

  const lines: Array<[AIState, string]> = [
    [{ status: null }, 'Generate'],
    [{ status: 'pending' }, 'Generating…'],
    [{ status: 'done', value: 'Ships on Friday.' }, 'Regenerate'],
    [{ status: 'error', error: 'Model refused' }, 'Failed: Model refused · Retry'],
    [{ status: 'manual' }, "Edited by hand, won't update automatically · Regenerate"],
  ];

  for (const [state, line] of lines) {
    await setState(page, id, state);
    await page.goto(`/collections/${tasksSlug}/${id}`);

    await expect(statusLine(page)).toHaveText(line);
  }
});

test('a hand edit in the edit view is kept, and Regenerate starts a run', async ({ page }) => {
  const id = await createTask(page, { title: 'Ship the order', notes: 'Courier picks up Friday' });

  await setState(page, id, { status: 'done', value: 'Ships on Friday.' });
  await page.goto(`/collections/${tasksSlug}/${id}`);

  await expect(statusLine(page)).toHaveText('Regenerate');

  await page.locator(`#field-${aiFieldName}`).fill('Courier on Friday, 9am.');

  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      new URL(response.url()).pathname === `/api/${tasksSlug}/${id}`,
  );

  await page.getByRole('button', { name: 'Save', exact: true }).click();

  expect((await saved).ok()).toBe(true);
  await expect(statusLine(page)).toHaveText(
    "Edited by hand, won't update automatically · Regenerate",
  );
  expect(await storedTask(page, id)).toMatchObject({
    [aiFieldName]: 'Courier on Friday, 9am.',
    [statusPath]: 'manual',
  });

  await statusLine(page).getByRole('button', { name: 'Regenerate' }).click();

  await expect(statusLine(page)).toHaveText('Generating…');
  await expectStoredStatus(page, id, 'pending');
});

test('an edit form opened while pending fills the result and saving does not regenerate', async ({
  page,
}) => {
  const id = await createTask(page, { title: 'Ship the order', notes: 'Courier picks up Friday' });

  await page.goto(`/collections/${tasksSlug}/${id}`);

  await expect(statusLine(page)).toHaveText('Generating…');

  await setState(page, id, { status: 'done', value: 'Ready.' });

  await expect(page.locator(`#field-${aiFieldName}`)).toHaveValue('Ready.', { timeout: 10_000 });
  await expect(statusLine(page)).toHaveText('Regenerate');

  await page.locator('#field-title').fill('Ship the order today');

  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      new URL(response.url()).pathname === `/api/${tasksSlug}/${id}`,
  );

  await page.getByRole('button', { name: 'Save', exact: true }).click();

  expect((await saved).ok()).toBe(true);
  expect(await storedTask(page, id)).toMatchObject({
    title: 'Ship the order today',
    [aiFieldName]: 'Ready.',
    [statusPath]: 'done',
  });
});
