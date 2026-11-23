import path from 'node:path';

import { expect, type Page, test } from '@playwright/test';

import { type AdminTheme, setAdminTheme } from './__helpers/adminTheme';

const created: number[] = [];
const shots = process.env.SIDE_PANEL_MATRIX_DIR;
const notes = 'A long note line that makes the panel body scroll.\n'.repeat(80);

const panel = (page: Page) => page.locator('.fb-record-panel');
const bar = (page: Page) => page.locator('.fb-record-panel-header');
const start = (page: Page) => bar(page).locator('.fb-side-panel-bar__start');
const lead = (page: Page) => bar(page).locator('.fb-side-panel-bar__lead');
const crumbs = (page: Page) =>
  start(page).evaluate((node) =>
    [...node.children]
      .filter((child) => !child.classList.contains('fb-side-panel-bar__lead'))
      .map((child) => child.textContent)
      .join(''),
  );

const body = (page: Page) => page.locator('.fb-record-panel__body');
const title = (page: Page) => page.locator('.fb-record-panel-title__input');

async function todo(page: Page, data: Record<string, unknown>) {
  const response = await page.request.post('/api/todos', { data });
  expect(response.ok()).toBe(true);
  const { doc } = (await response.json()) as { doc: { id: number } };
  created.push(doc.id);

  return doc.id;
}

async function budget(page: Page) {
  const parent = await todo(page, { notes, title: 'Budget feature' });
  const child = await todo(page, { notes, parent, title: 'Spec the cap rules' });

  return { child, parent };
}

async function openFromList(page: Page, name: string) {
  await page.goto('/collections/todos');
  await page.locator('tbody tr', { hasText: name }).getByRole('link').first().click();
  await expect(title(page)).toHaveValue(name);
}

async function drillIn(page: Page) {
  await page.locator('.fb-panel-join').getByRole('button', { name: 'Spec the cap rules' }).click();
  await expect(title(page)).toHaveValue('Spec the cap rules');
}

async function scrollBody(page: Page) {
  await body(page).evaluate((node) => node.scrollTo(0, node.scrollHeight));
}

async function rightSide(page: Page) {
  return bar(page)
    .locator('.fb-side-panel-bar__end > *')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('aria-label') ?? node.textContent?.trim()),
    );
}

async function shoot(page: Page, name: string) {
  if (!shots) return;
  const clip = (await panel(page).boundingBox())!;
  await page.screenshot({ clip, path: path.join(shots, `${name}.png`) });
}

const themes: AdminTheme[] = shots ? ['light', 'dark'] : ['light'];

test.afterEach(async ({ page }) => {
  for (const id of created.splice(0).reverse()) await page.request.delete(`/api/todos/${id}`);
});

for (const theme of themes) {
  test.describe(`side panel matrix, ${theme}`, () => {
    test.beforeEach(async ({ page }) => {
      await setAdminTheme(page, theme);
      await page.setViewportSize({ width: 1280, height: 640 });
    });

    test('1. opened from the view: only Mark complete on the left, the title once in the body', async ({
      page,
    }) => {
      await budget(page);
      await openFromList(page, 'Budget feature');

      await expect.poll(() => crumbs(page)).toBe('');
      await expect(lead(page).getByRole('button', { name: 'Mark complete' })).toBeVisible();
      expect(await rightSide(page)).toEqual(['More options', 'Open full page', 'Close']);
      await expect(bar(page).locator('.fb-side-panel-bar__title')).toHaveCount(0);
      await shoot(page, `${theme}-1-view`);
    });

    test('2. scrolled: the title moves into the bar', async ({ page }) => {
      await budget(page);
      await openFromList(page, 'Budget feature');

      await scrollBody(page);
      await expect.poll(() => crumbs(page)).toBe('Budget feature');
      await expect(bar(page).locator('.fb-side-panel-bar__title')).toBeVisible();
      await shoot(page, `${theme}-2-scrolled`);

      await body(page).evaluate((node) => node.scrollTo(0, 0));
      await expect.poll(() => crumbs(page)).toBe('');
    });

    test('3. drilled in from the panel: only the way back', async ({ page }) => {
      await budget(page);
      await openFromList(page, 'Budget feature');
      await drillIn(page);

      await expect.poll(() => crumbs(page)).toBe('Budget feature');
      await expect(bar(page).getByRole('button', { name: 'Back to Budget feature' })).toBeVisible();
      await expect(bar(page).locator('.fb-side-panel-bar__title')).toHaveCount(0);
      await shoot(page, `${theme}-3-drilled`);

      await bar(page).getByRole('button', { name: 'Back to Budget feature' }).click();
      await expect(title(page)).toHaveValue('Budget feature');
      await expect.poll(() => crumbs(page)).toBe('');
    });

    test('4. drilled in and scrolled: the way back, then the title; Completed', async ({
      page,
    }) => {
      await budget(page);
      await openFromList(page, 'Budget feature');
      await drillIn(page);

      await bar(page).getByRole('button', { name: 'Mark complete' }).click();

      await expect(bar(page).getByRole('button', { name: 'Completed' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );

      await scrollBody(page);
      await expect.poll(() => crumbs(page)).toBe('Budget feature/Spec the cap rules');
      await shoot(page, `${theme}-4-drilled-scrolled`);
    });

    test('5. a shared link: the view behind already names the collection', async ({ page }) => {
      const { parent } = await budget(page);

      await page.goto(`/collections/todos?record=${parent}`);
      await expect(title(page)).toHaveValue('Budget feature');
      await expect(page.locator('.list-header__title, h1').first()).toContainText('Todos');
      await expect.poll(() => crumbs(page)).toBe('');
      await shoot(page, `${theme}-5-link`);
    });

    test('6. unsaved edits: Unsaved and Save in the status slot, left side empty', async ({
      page,
    }) => {
      await budget(page);
      await openFromList(page, 'Budget feature');

      await panel(page).locator('#field-notes').fill('Changed');
      await expect(bar(page).locator('.fb-record-panel-header__unsaved')).toHaveText('Unsaved');
      expect(await rightSide(page)).toEqual([
        'UnsavedSave',
        'More options',
        'Open full page',
        'Close',
      ]);
      await expect.poll(() => crumbs(page)).toBe('');
      await expect(lead(page)).toHaveCount(0);
      await shoot(page, `${theme}-6-unsaved`);
    });

    test('9. 375 px, drilled in and scrolled: icon-only Mark complete, the title truncates', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 375, height: 640 });
      await budget(page);
      await openFromList(page, 'Budget feature');
      await drillIn(page);
      await scrollBody(page);

      await expect.poll(() => crumbs(page)).toBe('Budget feature/Spec the cap rules');
      await expect(bar(page).locator('.fb-record-panel-header__complete-label')).toBeHidden();
      await expect(bar(page).locator('.fb-record-panel-header__complete-icon')).toBeVisible();
      expect((await bar(page).boundingBox())!.height).toBeLessThan(64);

      for (const name of ['More options', 'Open full page', 'Close']) {
        const box = (await bar(page).getByRole('button', { name }).boundingBox())!;
        expect(box.width).toBe(32);
        expect(box.x + box.width).toBeLessThanOrEqual(375);
      }

      const crumbTitle = bar(page).locator('.fb-side-panel-bar__title');
      expect((await crumbTitle.boundingBox())!.width).toBeGreaterThan(30);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        375,
      );

      await shoot(page, `${theme}-9-narrow`);
    });

    test('10. the ••• menu: copy link, duplicate, create new, saved time, delete', async ({
      page,
    }) => {
      await budget(page);
      await openFromList(page, 'Budget feature');

      await bar(page).getByRole('button', { name: 'More options' }).click();
      const menu = page.getByRole('menu');

      await expect(menu.getByRole('menuitem')).toHaveText([
        'Copy link',
        'Duplicate',
        'Create New',
        'Delete',
      ]);
      await expect(menu.locator('.fb-side-panel-bar__note')).toHaveText(/^Saved /);
      await shoot(page, `${theme}-10-menu`);

      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
      await expect(panel(page)).toHaveCount(1);
      await page.keyboard.press('Escape');
      await expect(panel(page)).toHaveCount(0);
    });
  });
}
