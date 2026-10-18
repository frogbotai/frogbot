import path from 'node:path';

import { expect, type Page, test } from '@playwright/test';

import {
  adminStack,
  buildGallery,
  differences,
  fontsCss,
  readGallery,
  renderGallery,
  standaloneStack,
  stylesheet,
} from './fixtures/ui-parity/build';

let js = '';
let overlays = '';
let admin = '';
let standalone = '';

test.beforeAll(async () => {
  [js, overlays, admin, standalone] = await Promise.all([
    buildGallery(),
    buildGallery(path.join(import.meta.dirname, 'fixtures', 'ui-parity', 'overlays.tsx')),
    stylesheet([...adminStack, fontsCss]),
    stylesheet([...standaloneStack, fontsCss]),
  ]);
});

test.use({ viewport: { width: 1000, height: 1200 } });

const focusFirst = (page: Page) => page.locator('.parity-bare-button').focus();

const overlaysReady: Record<string, (page: Page) => Promise<void>> = {
  'menus, popovers and tooltips': async (page) => {
    await expect(page.locator('.fb-tooltip__content')).toBeVisible();
    await page.getByRole('button', { name: 'Agent' }).click();
    await expect(page.getByRole('menuitem', { name: 'Plan' })).toBeVisible();
    await expect(page.locator('.fb-popover__content')).toBeVisible();
  },
  'open selects': (page) => expect(page.getByRole('listbox')).toBeVisible(),
  dialogs: (page) => expect(page.getByRole('dialog')).toBeVisible(),
};

for (const theme of ['light', 'dark'] as const) {
  test(`FrogBot components render the same with and without Payload's CSS, ${theme}`, async ({
    page,
  }) => {
    await renderGallery(page, { css: admin, js, theme, admin: true });
    await focusFirst(page);
    const inAdmin = await readGallery(page);

    await renderGallery(page, { css: standalone, js, theme, admin: false });
    await focusFirst(page);
    const alone = await readGallery(page);

    expect(inAdmin.length).toBeGreaterThan(150);
    expect(differences(inAdmin, alone)).toEqual([]);
  });

  for (const [open, ready] of Object.entries(overlaysReady)) {
    test(`${open} render the same with and without Payload's CSS, ${theme}`, async ({ page }) => {
      const attributes = ` data-gallery-overlay="${open}"`;
      const pages = [];

      for (const [css, isAdmin] of [
        [admin, true],
        [standalone, false],
      ] as const) {
        await renderGallery(page, { css, js: overlays, theme, admin: isAdmin, attributes });
        await ready(page);
        pages.push(await readGallery(page));
      }

      expect(pages[0].length).toBeGreaterThan(20);
      expect(differences(pages[0], pages[1])).toEqual([]);
    });
  }
}

test('an admin page looks the same when its CSS chunks put the reset layer last', async ({
  page,
}) => {
  await renderGallery(page, { css: admin, js, theme: 'light', admin: true });
  const inOrder = await readGallery(page);

  const chunksFirst = `@layer payload-default, payload, frogbot;\n${admin}`;

  await renderGallery(page, { css: chunksFirst, js, theme: 'light', admin: true });

  expect(differences(inOrder, await readGallery(page))).toEqual([]);
});

test("an app's --font-body on :root sets the font of all FrogBot text on both pages", async ({
  page,
}) => {
  const font = ':root { --font-body: Satoshi, cursive; }';

  for (const [css, isAdmin] of [
    [admin, true],
    [standalone, false],
  ] as const) {
    await renderGallery(page, { css: css + font, js, theme: 'light', admin: isAdmin });

    const fonts = await page.evaluate(() => {
      const text = [...document.querySelectorAll('[data-fb-ui] *')].filter(
        (element) =>
          !element.closest('code, kbd, samp, pre') &&
          [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent?.trim()),
      );

      return [...new Set(text.map((element) => getComputedStyle(element).fontFamily))];
    });

    expect(fonts).toEqual(['Satoshi, cursive']);
  }
});

test('hidden elements and closed tool card bodies stay hidden on both pages', async ({ page }) => {
  for (const [css, isAdmin] of [
    [admin, true],
    [standalone, false],
  ] as const) {
    await renderGallery(page, { css, js, theme: 'light', admin: isAdmin });
    await expect(page.locator('.fb-parity-hidden')).toHaveCSS('display', 'none');
    await expect(page.locator('.fb-parity-closed')).toBeVisible();
    await expect(page.locator('.fb-parity-closed .fb-tool-card__body')).toBeHidden();
    await expect(
      page.locator('.fb-parity-closed + .fb-tool-card .fb-tool-card__body'),
    ).toBeVisible();
  }
});
