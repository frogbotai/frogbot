import path from 'node:path';

import { expect, type Page } from '@playwright/test';

import { today } from '../fixtures/crm/shared';
import { setAdminTheme } from './adminTheme';

export const themes = ['light', 'dark'] as const;

export const viewports = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

const transparentPixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

/**
 * Fixes the page's clock at the QA seed's `today`, and answers requests to other
 * hosts (such as avatar images) with a blank pixel, so screenshots don't depend on
 * the network. Call before the first navigation.
 */
export async function prepareView(page: Page) {
  await page.clock.setFixedTime(today);

  await page.route(
    (url) => url.hostname !== 'localhost' && url.hostname !== '127.0.0.1',
    (route) => route.fulfill({ body: transparentPixel, contentType: 'image/png' }),
  );
}

async function waitForView(page: Page) {
  await page
    .locator('table, .collection-board, .collection-gallery, .frog-calendar, .frog-timeline')
    .first()
    .waitFor();

  await page.waitForLoadState('networkidle');

  await page.waitForFunction(() =>
    [...document.images]
      .filter((image) => image.getAttribute('src'))
      .every((image) => image.complete && image.naturalWidth > 0),
  );

  await page.evaluate(() => document.fonts.ready);
}

async function hideDevIndicator(page: Page) {
  await page.addStyleTag({
    content:
      'nextjs-portal, [data-nextjs-toast], [data-next-badge-root] { display: none !important; }',
  });
}

/**
 * Screenshots the open view in light and dark, at 1440 and 390 pixels wide, as
 * `<name>-<theme>-<width>.png` in `options.path`, after `options.waitFor` shows when given and
 * `options.prepare` has run.
 * It saves the files and compares nothing.
 */
export async function shootView(
  page: Page,
  name: string,
  options: { path: string; prepare?: (page: Page) => Promise<void>; waitFor?: string },
) {
  const files: string[] = [];

  for (const colorScheme of themes) {
    await setAdminTheme(page, colorScheme);
    await page.emulateMedia({ colorScheme });
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await waitForView(page);
      if (options.waitFor) await page.locator(options.waitFor).first().waitFor();
      await hideDevIndicator(page);
      await options.prepare?.(page);

      const file = path.join(options.path, `${name}-${colorScheme}-${viewport.width}.png`);

      await page.screenshot({ path: file, animations: 'disabled' });
      files.push(file);
    }
  }

  return files;
}
