import { expect, type Locator, type Page, test } from '@playwright/test';

import { tagsSlug, tasksSlug, usersSlug } from './fixtures/question/shared';

const longIDs = ['bedrock/us.anthropic.claude-sonnet-5-5', 'bedrock/openai.gpt-oss-120b-1:0'];

const exact = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

async function openSelectedModels(page: Page): Promise<Locator> {
  const me = await page.request.get(`/api/${usersSlug}/me`);

  expect(me.ok()).toBe(true);

  const { user } = await me.json();

  await page.goto(`/collections/${usersSlug}/${user.id}`);
  await page.getByText('Selected models', { exact: true }).click();

  const field = page.locator('.frogbot-model-select');

  await expect(field).toBeVisible();

  return field;
}

async function openMenu(page: Page, field: Locator): Promise<Locator> {
  const menu = page.locator('.rs__menu');

  if (await menu.isHidden()) await field.locator('.dropdown-indicator').click();
  await expect(menu).toBeVisible();

  return menu;
}

async function pick(page: Page, field: Locator, label: string) {
  const menu = await openMenu(page, field);

  await menu.locator('.rs__option', { hasText: exact(label) }).click();
  await expect(field.locator('.multi-value-label__text', { hasText: exact(label) })).toBeVisible();
}

const overflows = (element: Locator) =>
  element.evaluate((node) => node.scrollWidth > node.clientWidth);

const rootFontSize = (page: Page) =>
  page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));

const maxWidth = (element: Locator) => element.evaluate((node) => getComputedStyle(node).maxWidth);

test('model chips show the full model ID', async ({ page }) => {
  const field = await openSelectedModels(page);

  for (const id of longIDs) await pick(page, field, id);

  for (const id of longIDs) {
    const text = field.locator('.multi-value-label__text', { hasText: exact(id) });
    const label = field
      .locator('.multi-value-label')
      .filter({ has: page.locator('.multi-value-label__text', { hasText: exact(id) }) });

    await expect(text).toHaveText(id);
    expect(await overflows(label)).toBe(false);
    expect(await overflows(text)).toBe(false);
  }
});

test('model chips wrap onto more rows instead of scrolling', async ({ page }) => {
  const field = await openSelectedModels(page);
  const chips = field.locator('.multi-value-label');
  const rows = async () =>
    new Set(
      await chips.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top)),
    ).size;

  while ((await rows()) < 2) {
    const menu = await openMenu(page, field);
    const next = menu.locator('.rs__option', { hasText: /^bedrock\// }).first();
    const label = (await next.textContent()) ?? '';
    const count = await chips.count();

    expect(label).toMatch(/^bedrock\//);
    await next.click();
    await expect(chips).toHaveCount(count + 1);
  }

  expect(await overflows(field.locator('.rs__value-container'))).toBe(false);
});

test.describe('other multi-pick fields', () => {
  test.beforeEach(async ({ page }) => {
    expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
  });

  test.afterEach(async ({ page }) => {
    expect((await page.request.post('/api/browser/reset')).ok()).toBe(true);
  });

  test('keep the default chip width cap', async ({ page }) => {
    const tag = await page.request.post(`/api/${tagsSlug}`, { data: { name: 'urgent' } });

    expect(tag.ok()).toBe(true);

    await page.goto(`/collections/${tasksSlug}/create`);

    const labels = page.locator('#field-labels');
    const tags = page.locator('#field-tags');

    await (await openMenu(page, labels)).locator('.rs__option', { hasText: exact('Blue') }).click();
    await expect(labels.locator('.multi-value-label')).toHaveCount(1);
    await page.keyboard.press('Escape');

    await (await openMenu(page, tags)).locator('.rs__option', { hasText: exact('urgent') }).click();
    await expect(tags.locator('.relationship--multi-value-label')).toHaveCount(1);

    const cap = `${9.375 * (await rootFontSize(page))}px`;

    expect(await maxWidth(labels.locator('.multi-value-label'))).toBe(cap);
    expect(await maxWidth(tags.locator('.relationship--multi-value-label__content'))).toBe(cap);
  });
});
