import path from 'node:path';

import { expect, type Locator, type Page, test, type TestInfo } from '@playwright/test';

import { setAdminTheme } from './__helpers/adminTheme';
import { setNavPreference, waitForNavSettled } from './__helpers/sidebar';
import { signedOut } from './__helpers/signIn';
import { chatsSlug, notesSlug } from './fixtures/dojo/shared';

type Box = { x: number; y: number; width: number; height: number };

type Sidebar = 'open' | 'closed' | 'drawer-closed' | 'drawer-open';

const href = 'https://frogbot.ai/?utm_source=dojo&utm_medium=badge';
const height = 800;

const badge = (page: Page) => page.locator('.fb-dojo-badge');
const composer = (page: Page) => page.locator('.fb-chat__composer');
const account = (page: Page) => page.getByRole('button', { name: 'Account' });

const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function box(locator: Locator): Promise<Box> {
  const found = await locator.boundingBox();

  expect(found, String(locator)).not.toBeNull();

  return found!;
}

async function save(page: Page, testInfo: TestInfo, name: string) {
  const file = path.join(testInfo.project.outputDir, 'dojo-badge', `${name}.png`);

  await page.screenshot({ path: file });
  await testInfo.attach(name, { path: file, contentType: 'image/png' });
}

async function badgeMounted(page: Page) {
  await expect(badge(page)).toBeAttached();
}

async function expectUncovered(locator: Locator) {
  const covered = await locator.evaluateAll((elements) =>
    elements.some((element) => {
      const { left, top, right, bottom, width } = element.getBoundingClientRect();
      const points = [
        [left + 1, top + 1],
        [right - 1, top + 1],
        [left + 1, bottom - 1],
        [right - 1, bottom - 1],
        [(left + right) / 2, (top + bottom) / 2],
      ];

      return (
        width > 0 &&
        points.some(([x, y]) => document.elementFromPoint(x, y)?.closest('.fb-dojo-badge'))
      );
    }),
  );

  expect(covered, String(locator)).toBe(false);
}

async function expectAccountUncovered(page: Page) {
  if (!(await account(page).isVisible())) return;

  await expectUncovered(account(page));
}

async function seedNotes(page: Page, count: number) {
  for (let index = 0; index < count; index++) {
    const created = await page.request.post(`/api/${notesSlug}`, {
      data: { title: `Paged note ${index + 1}` },
    });

    expect(created.ok()).toBe(true);
  }
}

async function expectBesideComposer(page: Page, shown: boolean) {
  await expect(badge(page)).toBeVisible({ visible: shown });

  if (shown) expect(intersects(await box(badge(page)), await box(composer(page)))).toBe(false);
}

async function seedChat(page: Page) {
  const seeded = await page.request.post('/api/browser/seed');

  expect(seeded.ok()).toBe(true);

  return (await seeded.json()).chatId as number | string;
}

const layouts: Array<{ width: number; sidebar: Sidebar }> = [
  { width: 375, sidebar: 'drawer-closed' },
  { width: 375, sidebar: 'drawer-open' },
  ...[768, 1280, 1920].flatMap((width) =>
    (['open', 'closed'] as const).map((sidebar) => ({ width, sidebar })),
  ),
];

const chatLayouts = [
  ...layouts,
  { width: 1500, sidebar: 'open' as const },
  { width: 1300, sidebar: 'closed' as const },
];

const shownBesideComposer = ({ width, sidebar }: (typeof layouts)[number]) =>
  width >= (sidebar === 'open' ? 1500 : 1300);

async function openAt(page: Page, url: string, { width, sidebar }: (typeof layouts)[number]) {
  await setNavPreference(page, sidebar !== 'closed');
  await page.setViewportSize({ width, height });
  await page.goto(url);
  await waitForNavSettled(page);

  if (sidebar === 'drawer-open') {
    await page.getByRole('button', { name: 'Open navigation' }).click();

    await expect(page.locator('.fb-nav-shell')).toHaveAttribute(
      'data-nav-state',
      'mobile-nav-open',
    );
  }

  await badgeMounted(page);
}

test.describe('signed out', () => {
  test.use({ storageState: signedOut });

  test('login shows the badge after hydration only', async ({ page, request }, testInfo) => {
    const html = await (await request.get('/login')).text();

    expect(html.includes('login__brand')).toBe(true);
    expect(html.includes('class="fb-dojo-badge')).toBe(false);

    await page.goto('/login');

    const link = page.getByRole('link', { name: 'Made with FrogBot · Share your own' });

    await expect(link).toHaveAttribute('href', href);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /\bnoopener\b/);
    await expect(badge(page)).toHaveCount(1);

    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height });
      await expect(badge(page)).toBeVisible();
      expect(intersects(await box(badge(page)), await box(page.locator('form')))).toBe(false);
      await save(page, testInfo, `login-${width}`);
    }
  });
});

test.describe('signed in', () => {
  test.afterEach(async ({ page }) => {
    await setNavPreference(page, true);
  });

  for (const layout of layouts) {
    const name = `${layout.width}-${layout.sidebar}`;

    test(`edit view at ${name} keeps the pill clear of the Account button`, async ({
      page,
    }, testInfo) => {
      await openAt(page, `/collections/${notesSlug}/create`, layout);

      await save(page, testInfo, `edit-${name}`);
      await expect(badge(page)).toBeVisible({ visible: layout.sidebar !== 'drawer-open' });
      await expectAccountUncovered(page);
    });
  }

  for (const width of [375, 768, 1280, 1920]) {
    test(`collection list at ${width} leaves the pagination uncovered`, async ({
      page,
    }, testInfo) => {
      await seedNotes(page, 12);

      await openAt(page, `/collections/${notesSlug}?limit=5`, {
        width,
        sidebar: width < 768 ? 'drawer-closed' : 'open',
      });

      const paginator = page.locator('.page-controls .paginator');

      await expect(paginator.getByRole('button').first()).toBeVisible();
      await page.locator('.page-controls').scrollIntoViewIfNeeded();
      await save(page, testInfo, `list-${width}-pagination`);
      await expect(badge(page)).toBeHidden();
      await expectUncovered(paginator.locator('button, input'));
      await expectUncovered(page.locator('.page-controls .per-page button'));
      await expectAccountUncovered(page);
    });
  }

  for (const layout of chatLayouts) {
    const name = `${layout.width}-${layout.sidebar}`;

    test(`chat at ${name} keeps the pill off the composer`, async ({ page }, testInfo) => {
      const chatId = await seedChat(page);

      await openAt(page, `/collections/${chatsSlug}/${chatId}`, layout);
      await expect(composer(page)).toBeVisible();
      await expect(page.locator('.fb-message-list')).toContainText('Message 6.');
      await save(page, testInfo, `chat-${name}`);
      await expectBesideComposer(page, shownBesideComposer(layout));
      await expectAccountUncovered(page);
    });
  }

  test('dark theme uses the theme colours', async ({ page }, testInfo) => {
    await setAdminTheme(page, 'dark');
    await openAt(page, `/collections/${notesSlug}/create`, { width: 1280, sidebar: 'open' });

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(badge(page)).toBeVisible();

    const colours = await badge(page).evaluate((element) => {
      const style = getComputedStyle(element);

      return { background: style.backgroundColor, text: style.color };
    });

    expect(colours.background).not.toBe(colours.text);
    await save(page, testInfo, 'edit-1280-open-dark');
  });

  test('close hides the pill for the browser session', async ({ page, browser }) => {
    await page.goto(`/collections/${notesSlug}/create`);
    await expect(badge(page)).toBeVisible();

    await page.getByRole('button', { name: 'Hide Made with FrogBot badge' }).click();
    await expect(badge(page)).toHaveCount(0);

    await page.goto('/collections/users/create');
    await waitForNavSettled(page);
    await expect(badge(page)).toHaveCount(0);

    const fresh = await browser.newContext({ storageState: signedOut });
    const other = await fresh.newPage();

    await other.goto(new URL('/login', page.url()).href);
    await expect(badge(other)).toBeVisible();
    await fresh.close();
  });

  test('a drawer covers the pill', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height });
    await page.goto(`/collections/${notesSlug}/create`);
    await expect(badge(page)).toBeVisible();

    await page
      .locator('.field-type.relationship')
      .getByRole('button', { name: /add new/i })
      .click();

    const drawer = page.locator('.drawer__content').last();

    await expect(drawer).toBeVisible();

    const { x, y, width, height: tall } = await box(badge(page));
    const top = await page.evaluate(
      ([px, py]) => document.elementFromPoint(px, py)?.closest('.fb-dojo-badge') !== null,
      [x + width / 2, y + tall / 2],
    );

    expect(top).toBe(false);
    await save(page, testInfo, 'drawer-1280');
  });
});
