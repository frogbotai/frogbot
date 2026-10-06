import { expect, type Locator, type Page, test } from '@playwright/test';

import { setAdminTheme } from './__helpers/adminTheme';
import { createMessage, deleteMessage, type SavedMessage } from './__helpers/messages';
import {
  collectionNavIcon,
  expectTwoPixelStroke,
  navStates,
  recordNavStates,
  setNavPreference,
  waitForNavPreferenceSave,
  waitForNavSettled,
} from './__helpers/sidebar';
import { signedOut } from './__helpers/signIn';

const desktop = { width: 1440, height: 900 };
const laptop = { width: 1280, height: 800 };
const mobile = { width: 390, height: 844 };
const expandedRem = 17;
const collapsedWidth = 60;

const shell = (page: Page) => page.locator('.frogbot-nav-shell');
const backdrop = (page: Page) => page.locator('.frogbot-nav-backdrop');

const shellWidth = (page: Page) =>
  shell(page).evaluate((el) => Math.round(el.getBoundingClientRect().width));
const contentWidth = (page: Page) =>
  page
    .locator('.template-default__wrap')
    .evaluate((el) => Math.round(el.getBoundingClientRect().width));
const expandedWidth = (page: Page) =>
  page.evaluate(
    (rem) => Math.round(parseFloat(getComputedStyle(document.documentElement).fontSize) * rem),
    expandedRem,
  );

const noHorizontalOverflow = async (page: Page) => {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBe(innerWidth);
};

const drawnBounds = (icon: Locator) =>
  icon.evaluate((svg) => {
    const boxes = [...svg.children].map((child) => (child as SVGGraphicsElement).getBBox());
    const left = Math.min(...boxes.map((box) => box.x));
    const top = Math.min(...boxes.map((box) => box.y));
    const right = Math.max(...boxes.map((box) => box.x + box.width));
    const bottom = Math.max(...boxes.map((box) => box.y + box.height));

    return { centreX: (left + right) / 2, centreY: (top + bottom) / 2, width: right - left };
  });

const loadWithSidebarOpen = async (page: Page) => {
  await setNavPreference(page, true);
  await page.goto('/');
  await waitForNavSettled(page);

  await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-open');
};

test.describe('nav shell on desktop', () => {
  test.use({ viewport: desktop });

  test('expanded sidebar shares the grid with full-width content', async ({ page }) => {
    await loadWithSidebarOpen(page);

    const sidebarWidth = await expandedWidth(page);
    await expect(shell(page)).toHaveCSS('opacity', '1');
    await expect.poll(() => shellWidth(page)).toBe(sidebarWidth);
    await expect.poll(() => contentWidth(page)).toBe(desktop.width - sidebarWidth);
    await expect(backdrop(page)).toHaveCount(0);
    await noHorizontalOverflow(page);
  });

  test('collections section links to the configured collections', async ({ page }) => {
    await loadWithSidebarOpen(page);

    await expect(
      page.locator('#frogbot-nav-section-collections').getByRole('link', { name: 'Users' }),
    ).toHaveAttribute('href', '/collections/users');
  });

  test('home page shows collection cards instead of chat', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('#card-users .card__click')).toHaveAttribute(
      'href',
      '/collections/users',
    );
    await expect(page.locator('.fb-composer')).toHaveCount(0);
  });

  test('home page lists built-in collection cards under one Collections heading', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.locator('.collections__label')).toHaveText(['Collections']);
    await expect(page.locator('.collections__group #card-chats')).toHaveCount(1);
    await expect(page.locator('.collections__group #card-files')).toHaveCount(1);
  });

  test('default sidebar shows only the Collections section, with Chats and its icon', async ({
    page,
  }) => {
    await loadWithSidebarOpen(page);

    const collections = page.locator('#frogbot-nav-section-collections');
    const chats = collections.getByRole('link', { name: 'Chats' });

    await expect(chats).toHaveAttribute('href', '/collections/chats');
    await expect(chats.locator('svg')).toHaveCount(1);
    await expect(collections.locator('.frogbot-collections-section__group-label')).toHaveCount(0);
    await expect(shell(page).getByText('Collections', { exact: true })).toHaveCount(1);
    await expect(shell(page).getByRole('button', { name: 'New Chat' })).toHaveCount(0);
    await expect(page.locator('#frogbot-nav-section-recents')).toHaveCount(0);
  });

  test('default sidebar has no Messages link', async ({ page }) => {
    await loadWithSidebarOpen(page);

    const collections = page.locator('#frogbot-nav-section-collections');

    await expect(collections.getByRole('link', { name: 'Chats' })).toBeVisible();
    await expect(collections.getByRole('link', { name: 'Messages' })).toHaveCount(0);
  });

  test('home page has no Messages card', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('#card-chats')).toHaveCount(1);
    await expect(page.locator('#card-messages')).toHaveCount(0);
  });

  test('Settings > Collections has no Messages card', async ({ page }) => {
    await page.goto('/settings/collections');

    await expect(page.locator('#card-chats')).toHaveCount(1);
    await expect(page.locator('#card-messages')).toHaveCount(0);
  });

  test('messages list URL shows the admin not-found page', async ({ page }) => {
    await page.goto('/collections/messages');

    await expect(page.locator('.not-found')).toBeVisible();
  });

  test.describe('signed out', () => {
    test.use({ storageState: signedOut });

    test('messages list URL redirects a signed-out visitor to login', async ({ page }) => {
      await page.goto('/collections/messages');

      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe('with a saved message', () => {
    let saved: SavedMessage;

    test.beforeEach(async ({ page }) => {
      saved = await createMessage(page);
    });

    test.afterEach(async ({ page }) => {
      await deleteMessage(page, saved);
    });

    test('message document URL shows the admin not-found page', async ({ page }) => {
      await page.goto(`/collections/messages/${saved.messageId}`);

      await expect(page.locator('.not-found')).toBeVisible();
    });
  });

  test('chats create route opens the chat composer', async ({ page }) => {
    await page.goto('/collections/chats/create');

    await expect(page.locator('.fb-composer textarea')).toBeVisible();
  });

  test('collapsed sidebar stays visible as an icon rail', async ({ page }) => {
    await loadWithSidebarOpen(page);

    await page.locator('button[aria-label="Close sidebar"]').click();
    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-closed');
    await expect(shell(page)).toHaveCSS('opacity', '1');
    await expect.poll(() => shellWidth(page)).toBe(collapsedWidth);
    await expect.poll(() => contentWidth(page)).toBe(desktop.width - collapsedWidth);
    await expect(page.locator('.frogbot-admin-sidebar__logo')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Account' })).toBeVisible();
    await expect(page.locator('#frogbot-nav-section-collections')).toHaveCount(0);
    await expect(collectionNavIcon(page, 'chats')).toHaveCount(0);
    await noHorizontalOverflow(page);

    await page.locator('button[aria-label="Open sidebar"]').click();
    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-open');
  });

  test('sidebar shows Chats as a centred bubble without a dot', async ({ page }) => {
    await loadWithSidebarOpen(page);

    const icon = collectionNavIcon(page, 'chats');

    await expect(icon).toHaveClass(/\blucide-bubble-chat-icon\b/);
    await expect(icon.locator('circle')).toHaveCount(0);

    const bounds = await drawnBounds(icon);

    expect(Math.abs(bounds.centreX - 12)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(bounds.centreY - 12)).toBeLessThanOrEqual(0.5);
    expect(bounds.width).toBeGreaterThanOrEqual(18);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`sidebar collection icons draw 2px in the ${theme} theme`, async ({ page }) => {
      await setAdminTheme(page, theme);
      await loadWithSidebarOpen(page);

      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      for (const slug of ['chats', 'users', 'files']) {
        await expectTwoPixelStroke(collectionNavIcon(page, slug));
      }
    });
  }
});

test.describe('nav shell keeps the saved desktop state', () => {
  const hydrationError = /Hydration failed|did not match|Minified React error #(418|423|425)\b/;

  let hydrationErrors: string[];

  test.beforeEach(async ({ page }) => {
    hydrationErrors = [];

    page.on('console', (message) => {
      if (hydrationError.test(message.text())) hydrationErrors.push(message.text());
    });

    page.on('pageerror', (error) => {
      if (hydrationError.test(error.message)) hydrationErrors.push(error.message);
    });

    await setNavPreference(page, true);
    await recordNavStates(page);
  });

  test.afterEach(async ({ page }) => {
    await setNavPreference(page, true);

    expect(hydrationErrors).toEqual([]);
  });

  for (const width of [768, 1024, 1280, 1440, 1600]) {
    test(`sidebar loads open at ${width}px when saved open`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });

      await page.goto('/collections/users');
      await waitForNavSettled(page);

      await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-open');
      expect(await navStates(page)).not.toContain('desktop-nav-closed');
      await expect(page.locator('.template-default')).toHaveClass(/template-default--nav-open/);
    });
  }

  test('sidebar reloads collapsed and then open at 1280px', async ({ page }) => {
    await page.setViewportSize(laptop);
    await page.goto('/');
    await waitForNavSettled(page);

    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-open');

    const collapseSaved = waitForNavPreferenceSave(page);

    await page.locator('button[aria-label="Close sidebar"]').click();
    await collapseSaved;
    await page.reload();
    await waitForNavSettled(page);

    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-closed');

    const openSaved = waitForNavPreferenceSave(page);

    await page.locator('button[aria-label="Open sidebar"]').click();
    await openSaved;
    await page.reload();
    await waitForNavSettled(page);

    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-open');
  });

  test('sidebar stays open when resized from 1600px to 1280px and 1024px', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 800 });
    await page.goto('/collections/users');
    await waitForNavSettled(page);

    await page.setViewportSize(laptop);
    await waitForNavSettled(page);

    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-open');

    await page.setViewportSize({ width: 1024, height: 800 });
    await waitForNavSettled(page);

    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-open');
    expect(await navStates(page)).not.toContain('desktop-nav-closed');
  });

  test('sidebar stays collapsed when resized from 1280px to 1600px', async ({ page }) => {
    await page.setViewportSize(laptop);
    await page.goto('/collections/users');
    await waitForNavSettled(page);

    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-open');

    const collapseSaved = waitForNavPreferenceSave(page);

    await page.locator('button[aria-label="Close sidebar"]').click();
    await collapseSaved;
    await page.setViewportSize({ width: 1600, height: 800 });
    await waitForNavSettled(page);

    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-closed');
  });

  test('sidebar keeps its state across in-app navigation at 768px', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 800 });
    await page.goto('/');
    await waitForNavSettled(page);

    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-open');

    await page
      .locator('#frogbot-nav-section-collections')
      .getByRole('link', { name: 'Users' })
      .click();
    await page.waitForURL((url) => url.pathname === '/collections/users');
    await waitForNavSettled(page);

    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-open');
    expect(await navStates(page)).not.toContain('desktop-nav-closed');
  });

  test('sidebar toggled just before navigating keeps the new state', async ({ page }) => {
    await page.setViewportSize(laptop);
    await page.goto('/');
    await waitForNavSettled(page);

    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-open');

    await page.locator('button[aria-label="Close sidebar"]').click();
    await page.locator('#card-users .card__click').click();
    await page.waitForURL((url) => url.pathname === '/collections/users');
    await waitForNavSettled(page);

    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-closed');

    await page.locator('button[aria-label="Open sidebar"]').click();
    await page.goBack();
    await page.waitForURL((url) => url.pathname === '/');
    await waitForNavSettled(page);

    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-open');
  });
});

test.describe('nav shell across breakpoints and fast toggles', () => {
  let savedValues: unknown[];

  test.beforeEach(async ({ page }) => {
    savedValues = [];

    await setNavPreference(page, true);
    await recordNavStates(page);

    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        new URL(request.url()).pathname === '/api/payload-preferences/nav'
      ) {
        savedValues.push(request.postDataJSON().value);
      }
    });
  });

  test.afterEach(async ({ page }) => {
    await setNavPreference(page, true);
  });

  test('sidebar starts open at 1280px when no preference is saved', async ({ page }) => {
    const deleted = await page.request.delete('/api/payload-preferences/nav');

    expect(deleted.ok()).toBe(true);

    await page.setViewportSize(laptop);
    await page.goto('/collections/users');
    await waitForNavSettled(page);

    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-open');
    expect(await navStates(page)).not.toContain('desktop-nav-closed');
    await expect(page.locator('.template-default')).toHaveClass(/template-default--nav-open/);
  });

  test('collapsed sidebar reloads without the Payload nav-open class at 1280px', async ({
    page,
  }) => {
    await setNavPreference(page, false);
    await page.setViewportSize(laptop);

    await page.goto('/collections/users');
    await waitForNavSettled(page);

    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-closed');
    await expect(page.locator('.template-default')).not.toHaveClass(/template-default--nav-open/);
    expect(await navStates(page)).not.toContain('desktop-nav-open');
  });

  test('open drawer resized to desktop shows the desktop choice without a backdrop', async ({
    page,
  }) => {
    await setNavPreference(page, false);
    await page.setViewportSize(mobile);
    await page.goto('/');
    await waitForNavSettled(page);
    await page.locator('button[aria-label="Open navigation"]').click();

    await expect(shell(page)).toHaveAttribute('data-nav-state', 'mobile-nav-open');

    await page.setViewportSize(laptop);
    await waitForNavSettled(page);

    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-closed');
    await expect(backdrop(page)).toHaveCount(0);
    await expect(page.locator('.template-default')).not.toHaveClass(/template-default--nav-open/);

    await page.setViewportSize(mobile);
    await waitForNavSettled(page);

    await expect(shell(page)).toHaveAttribute('data-nav-state', 'mobile-nav-closed');
    await expect(backdrop(page)).toHaveCount(0);
    expect(savedValues).toEqual([]);
  });

  test('drawer closes after navigating from it without saving the preference', async ({ page }) => {
    await page.setViewportSize(mobile);
    await page.goto('/');
    await waitForNavSettled(page);
    await page.locator('button[aria-label="Open navigation"]').click();

    await page
      .locator('#frogbot-nav-section-collections')
      .getByRole('link', { name: 'Users' })
      .click();
    await page.waitForURL((url) => url.pathname === '/collections/users');
    await waitForNavSettled(page);

    await expect(shell(page)).toHaveAttribute('data-nav-state', 'mobile-nav-closed');
    await expect(backdrop(page)).toHaveCount(0);

    await page.setViewportSize(laptop);
    await waitForNavSettled(page);

    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-open');
    expect(savedValues).toEqual([]);
  });

  // eslint-disable-next-line playwright/no-skipped-test -- known bug, see the annotation
  test.fixme(
    'desktop collapse survives going back on mobile and resizing to desktop',
    {
      annotation: {
        type: 'issue',
        description:
          'Ticket 183 Stage 6: Back on mobile remounts the sidebar with the router-cached initialOpen from before the desktop toggle, so the stale value wins after resizing to desktop. Also on main; awaiting owner decision.',
      },
    },
    async ({ page }) => {
      await page.setViewportSize(laptop);
      await page.goto('/');
      await waitForNavSettled(page);
      await page.locator('#card-users .card__click').click();
      await page.waitForURL((url) => url.pathname === '/collections/users');
      await waitForNavSettled(page);

      const collapseSaved = waitForNavPreferenceSave(page);

      await page.locator('button[aria-label="Close sidebar"]').click();
      await collapseSaved;
      await page.setViewportSize(mobile);
      await waitForNavSettled(page);
      await page.goBack();
      await page.waitForURL((url) => url.pathname === '/');
      await waitForNavSettled(page);
      await page.setViewportSize(laptop);
      await waitForNavSettled(page);

      await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-closed');
    },
  );

  test('rapid desktop toggles save and reload the last state', async ({ page }) => {
    await page.setViewportSize(laptop);
    await page.goto('/');
    await waitForNavSettled(page);

    await page.locator('button[aria-label="Close sidebar"]').click();
    await page.locator('button[aria-label="Open sidebar"]').click();
    await page.locator('button[aria-label="Close sidebar"]').click();

    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-closed');
    await expect
      .poll(
        async () => (await (await page.request.get('/api/payload-preferences/nav')).json()).value,
      )
      .toEqual({ open: false });

    await page.reload();
    await waitForNavSettled(page);

    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-closed');
    expect(savedValues.at(-1)).toEqual({ open: false });
  });
});

test.describe('nav shell on mobile', () => {
  test.use({ viewport: mobile });

  test.afterEach(async ({ page }) => {
    await setNavPreference(page, true);
  });

  // eslint-disable-next-line playwright/no-skipped-test -- known bug, see the annotation
  test.fixme(
    'drawer is never shown open on first load',
    {
      annotation: {
        type: 'issue',
        description:
          'Pre-existing on main: the hydrated shell renders mobile-nav-open for one commit on phone first load before the mobile close effect runs; reported separately from ticket 183.',
      },
    },
    async ({ page }) => {
      await setNavPreference(page, true);
      await recordNavStates(page);

      await page.goto('/');
      await waitForNavSettled(page);

      await expect(shell(page)).toHaveAttribute('data-nav-state', 'mobile-nav-closed');
      expect(await navStates(page)).not.toContain('mobile-nav-open');
    },
  );

  test('closing the drawer keeps the saved desktop preference', async ({ page }) => {
    const savedValues: unknown[] = [];

    await setNavPreference(page, true);

    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        new URL(request.url()).pathname === '/api/payload-preferences/nav'
      ) {
        savedValues.push(request.postDataJSON().value);
      }
    });

    await page.goto('/');
    await waitForNavSettled(page);
    await page.locator('button[aria-label="Open navigation"]').click();
    await page.locator('button[aria-label="Close sidebar"]').click();

    await expect(shell(page)).toHaveAttribute('data-nav-state', 'mobile-nav-closed');

    savedValues.push('resized');
    await page.setViewportSize(laptop);
    await waitForNavSettled(page);

    await expect(shell(page)).toHaveAttribute('data-nav-state', 'desktop-nav-open');

    const collapseSaved = waitForNavPreferenceSave(page);

    await page.locator('button[aria-label="Close sidebar"]').click();
    await collapseSaved;

    expect(savedValues).toEqual(['resized', { open: false }]);
  });

  test('closed drawer leaves the content full width', async ({ page }) => {
    await page.goto('/');
    await waitForNavSettled(page);

    await expect(shell(page)).toHaveAttribute('data-nav-state', 'mobile-nav-closed');
    await expect(shell(page)).toBeHidden();
    await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();
    await expect.poll(() => contentWidth(page)).toBe(mobile.width);
    await expect(backdrop(page)).toHaveCount(0);
    await noHorizontalOverflow(page);
  });

  test('open drawer overlays full-width content and closes from the backdrop', async ({ page }) => {
    await page.goto('/');
    await waitForNavSettled(page);

    await page.locator('button[aria-label="Open navigation"]').click();
    await expect(shell(page)).toHaveAttribute('data-nav-state', 'mobile-nav-open');
    await expect(shell(page)).toHaveCSS('position', 'fixed');
    await expect.poll(() => shellWidth(page)).toBe(await expandedWidth(page));
    await expect.poll(() => contentWidth(page)).toBe(mobile.width);
    await expect(backdrop(page)).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Open navigation' })).toHaveCount(0);
    await noHorizontalOverflow(page);

    await backdrop(page).click({ position: { x: mobile.width - 10, y: mobile.height / 2 } });
    await expect(shell(page)).toHaveAttribute('data-nav-state', 'mobile-nav-closed');
    await expect(backdrop(page)).toHaveCount(0);
  });

  test('open drawer closes with Escape', async ({ page }) => {
    await page.goto('/');
    await waitForNavSettled(page);

    await page.locator('button[aria-label="Open navigation"]').click();
    await expect(shell(page)).toHaveAttribute('data-nav-state', 'mobile-nav-open');
    await page.keyboard.press('Escape');
    await expect(shell(page)).toHaveAttribute('data-nav-state', 'mobile-nav-closed');
  });
});
