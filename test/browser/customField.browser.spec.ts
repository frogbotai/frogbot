import { expect, test } from '@playwright/test';

import { setAdminTheme } from './__helpers/adminTheme';
import { fetchMetadata, metadataValues } from './__helpers/metadata';
import {
  collectionNavIcon,
  expandSidebar,
  expectTwoPixelStroke,
  iconStroke,
} from './__helpers/sidebar';

test('renders a user-local client field built with useField and saves its value', async ({
  page,
}) => {
  await page.goto('/collections/posts/create');
  await page.getByLabel('Title').fill('Color report');
  await page.getByLabel('Color').fill('violet');
  await page.getByRole('button', { name: 'Save' }).click();

  await page.waitForURL((url) => /^\/collections\/posts\/(?!create$)[^/]+$/.test(url.pathname));
  await page.reload();

  await expect(page.getByLabel('Color')).toHaveValue('violet');
});

test('gives server field components req.frogbot on the create view', async ({ page }) => {
  await page.goto('/collections/posts/create');
  await page.getByLabel('Title').fill('Visible owner note');

  const ownerNote = page.getByTestId('owner-note');

  await expect(ownerNote).toBeVisible();
  await expect.poll(async () => Number(await ownerNote.textContent())).toBeGreaterThanOrEqual(2);
});

test('keeps req.frogbot after a form-state rebuild', async ({ page }) => {
  await page.goto('/collections/posts/create');

  const title = page.getByLabel('Title');
  const ownerNote = page.getByTestId('owner-note');

  await title.fill('First render');
  await expect(ownerNote).toBeVisible();

  const collectionCount = await ownerNote.textContent();

  await title.clear();
  await expect(ownerNote).toBeHidden();
  await title.fill('Rebuilt render');

  await expect(ownerNote).toHaveText(collectionCount || '');
});

test('renders the registered Reports view with the issued req.frogbot', async ({ page }) => {
  await page.goto('/reports');

  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
  await expect
    .poll(async () => Number(await page.getByTestId('reports-collections').textContent()))
    .toBeGreaterThanOrEqual(2);
  await expect(page.getByRole('button', { name: 'Reports' })).toBeVisible();
});

test('renders built-in and component nav item icons', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole('button', { name: 'Reports' }).locator('svg.lucide-home-icon'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'All posts' }).getByTestId('nav-component-icon'),
  ).toBeVisible();
});

test('lists ungrouped collections directly under one Collections heading', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const shell = page.locator('.frogbot-nav-shell');

  await expandSidebar(page);

  const collections = page.locator('#frogbot-nav-section-collections');

  await expect(shell.getByText('Collections', { exact: true })).toHaveCount(1);
  await expect(collections.locator('.frogbot-nav-section__scroll > .frogbot-nav-item')).toHaveText([
    'Users',
    'API Keys',
  ]);
  await expect(collections.locator('.frogbot-collections-section__group-label')).toHaveText([
    'Content',
  ]);
  await expect(
    collections.locator('.frogbot-collections-section__group .frogbot-nav-item'),
  ).toHaveText(['Posts']);
});

test('lists ungrouped collection cards directly under the Collections settings page', async ({
  page,
}) => {
  await page.goto('/settings/collections');

  const content = page.locator('.frogbot-settings-template__content');

  await expect(page.locator('.frogbot-settings-template__header')).toHaveText('Collections');
  await expect(content.getByRole('heading', { level: 2 })).toHaveText(['Content']);
  await expect(content.getByRole('heading', { level: 3 })).toHaveText([
    'Users',
    'API Keys',
    'Posts',
  ]);
});

test('renders the API Keys collection with the key icon directly under Collections', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  await expandSidebar(page);

  const apiKeys = page
    .locator('#frogbot-nav-section-collections .frogbot-nav-section__scroll > .frogbot-nav-item')
    .filter({ hasText: 'API Keys' });

  await expect(apiKeys.locator('svg.lucide-key-round-icon')).toBeVisible();
  await expect(apiKeys.locator('svg.lucide-folder-icon')).toHaveCount(0);
});

test('adds no API Keys entry to the Settings nav', async ({ page }) => {
  await page.goto('/settings/robot');

  const settingsNav = page.locator('.frogbot-settings-nav');

  await expect(settingsNav.getByRole('link', { name: 'Robot' })).toBeVisible();
  await expect(settingsNav.getByRole('link', { name: 'API Keys' })).toHaveCount(0);
});

test('renders the documented New Chat nav item with its built-in icon', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('button', { name: 'New Chat' }).locator('svg.lucide-pencil-edit'),
  ).toBeVisible();
});

test('renders built-in and component object settings icons', async ({ page }) => {
  await page.goto('/settings/robot');

  const settingsNav = page.locator('.frogbot-settings-nav');

  await expect(page.getByTestId('robot-settings')).toBeVisible();
  await expect(
    settingsNav.getByRole('link', { name: 'Robot' }).locator('svg.lucide-robot-icon'),
  ).toBeVisible();
  await expect(
    settingsNav.getByRole('link', { name: 'Usage' }).getByTestId('nav-component-icon'),
  ).toBeVisible();
});

test('renders typed default widgets with req.frogbot through the modular dashboard', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.getByTestId('welcome-widget')).toContainText('Default dashboard');
  await expect(page.getByTestId('activity-widget')).toContainText('Recent activity');
  await expect(page.locator('.app-header__step-nav .step-nav__last button')).toBeVisible();
  await expect(page).toHaveTitle('Dashboard - Field Lab');
  await expect(page.locator('head title[data-frogbot-tab-title]')).toHaveCount(0);
  await expect
    .poll(async () => Number(await page.getByTestId('welcome-widget-collections').textContent()))
    .toBeGreaterThanOrEqual(2);
  await expect
    .poll(async () => Number(await page.getByTestId('activity-widget-collections').textContent()))
    .toBeGreaterThanOrEqual(2);
});

test('edits, persists, and resets the modular dashboard layout', async ({ page }) => {
  await page.goto('/');

  const stepNav = page.locator('.app-header__step-nav-wrapper');

  await stepNav.locator('button').click();
  await stepNav.getByText('Edit Dashboard', { exact: true }).click();
  await page.getByRole('button', { exact: true, name: 'Edit welcome-0' }).click();

  const widgetEditor = page.getByRole('dialog', { name: /^widget-editor-/ });

  await expect(widgetEditor.getByRole('heading', { name: 'Edit Welcome summary' })).toBeVisible();
  await expect(widgetEditor.getByRole('textbox')).toHaveValue(/Default dashboard/);
  await widgetEditor.getByRole('textbox').fill('Saved dashboard heading');
  await widgetEditor.getByRole('button', { name: 'Save changes' }).click();
  await expect(widgetEditor).toBeHidden();
  await expect(page.getByTestId('welcome-widget')).toContainText('Saved dashboard heading');
  await stepNav.getByRole('button', { name: 'Save changes' }).click();

  await page.reload();

  await expect(page.getByTestId('welcome-widget')).toContainText('Saved dashboard heading');

  await stepNav.locator('button').click();
  await stepNav.getByText('Reset Layout', { exact: true }).click();

  await expect(page.getByTestId('welcome-widget')).toContainText('Default dashboard');

  await page.reload();

  await expect(page.getByTestId('welcome-widget')).toContainText('Default dashboard');
});

test('the phone dashboard breadcrumb dropdown keeps its options clickable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');

  await expect(page.locator('.frogbot-nav-shell')).toHaveAttribute(
    'data-nav-state',
    'mobile-nav-closed',
  );

  const stepNav = page.locator('.app-header__step-nav-wrapper');

  await stepNav.locator('button').click();

  const edit = stepNav.getByText('Edit Dashboard', { exact: true });

  await expect(edit).toBeVisible();
  await expect
    .poll(() =>
      edit.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);

        return element.contains(hit);
      }),
    )
    .toBe(true);

  await edit.click();

  await expect(stepNav.locator('.dashboard-breadcrumb-dropdown__editing')).toBeVisible();
  await expect(page).toHaveTitle('Dashboard - Field Lab');

  await stepNav.getByRole('button', { name: 'Cancel', exact: true }).click();

  await expect(stepNav.locator('.dashboard-breadcrumb-select')).toBeVisible();
});

test.describe('tab titles with a custom suffix and site name', () => {
  const pages = [
    { path: '/settings/collections', text: 'Collections', title: 'Collections - Field Lab' },
    { path: '/settings/robot', text: 'Robot', title: 'Robot - Field Lab' },
    { path: '/settings/usage', text: 'Usage', title: 'Usage - Field Lab' },
    { path: '/reports', text: 'Field Lab', title: 'Field Lab' },
    { path: '/titled-report', text: 'Titled report', title: 'Titled report - Field Lab' },
  ];

  for (const { path, text, title } of pages) {
    test(`${path} serves the title ${title} with matching metadata`, async ({ page }) => {
      const metadata = await fetchMetadata(page.request, path);

      expect(metadata.titles).toEqual([title]);
      expect(metadata).toMatchObject({ ogTitle: text, description: text, keywords: text });
    });
  }

  test('Settings and custom views serve no Payload in their titles or metadata', async ({
    page,
  }) => {
    const values = await Promise.all(
      pages.map(async ({ path }) => metadataValues(await fetchMetadata(page.request, path))),
    );

    expect(values.flat().filter((value) => value.includes('Payload'))).toEqual([]);
  });

  test('the tab follows Settings sidebar clicks with the custom suffix', async ({ page }) => {
    await page.goto('/settings/collections');

    const settingsNav = page.locator('.frogbot-settings-nav');

    await expect(page).toHaveTitle('Collections - Field Lab');

    await settingsNav.getByRole('link', { name: 'Robot', exact: true }).click();

    await expect(page).toHaveURL(/\/settings\/robot$/);
    await expect(page).toHaveTitle('Robot - Field Lab');

    await settingsNav.getByRole('link', { name: 'Usage', exact: true }).click();

    await expect(page).toHaveURL(/\/settings\/usage$/);
    await expect(page).toHaveTitle('Usage - Field Lab');
  });
});

test.describe('sidebar icon line weight', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`top-level and grouped icons draw 2px in the ${theme} theme`, async ({ page }) => {
      await setAdminTheme(page, theme);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/');

      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      await expandSidebar(page);

      await expectTwoPixelStroke(
        page.getByRole('button', { name: 'New Chat' }).locator('svg.lucide-pencil-edit'),
      );

      await expectTwoPixelStroke(
        page.getByRole('button', { name: 'Reports' }).locator('svg.lucide-home-icon'),
      );

      await expectTwoPixelStroke(collectionNavIcon(page, 'posts'));

      await expectTwoPixelStroke(
        page.locator('#frogbot-nav-section-collections svg.lucide-key-round-icon'),
      );
    });

    test(`a component nav icon keeps its own stroke in the ${theme} theme`, async ({ page }) => {
      await setAdminTheme(page, theme);
      await page.goto('/');

      const { widths, effects } = await iconStroke(
        page.getByRole('button', { name: 'All posts' }).getByTestId('nav-component-icon'),
      );

      expect(widths).toEqual(['1px']);
      expect(effects).toEqual(['none']);
    });
  }
});
