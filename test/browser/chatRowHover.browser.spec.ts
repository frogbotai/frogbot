import path from 'node:path';

import { expect, type Locator, type Page, test } from '@playwright/test';

import {
  buildWithoutPayload,
  fontsCss,
  renderGallery,
  standaloneStack,
  stylesheet,
} from './fixtures/ui-parity/build';

let js = '';
let css = '';

test.beforeAll(async () => {
  [js, css] = await Promise.all([
    buildWithoutPayload(path.join(import.meta.dirname, 'fixtures', 'ui-parity', 'chat-rows.tsx')),
    stylesheet([...standaloneStack, fontsCss]),
  ]);
});

test.use({ viewport: { width: 1440, height: 900 } });

const open = async (page: Page) => {
  await renderGallery(page, { css, js, theme: 'light', admin: false });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
};

const box = async (locator: Locator) => {
  const rect = await locator.boundingBox();

  if (!rect) throw new Error('no box');

  return { left: rect.x, right: rect.x + rect.width };
};

async function expectRowStaysInside(
  page: Page,
  { container, row, label }: { container: Locator; row: Locator; label: Locator },
) {
  await expect(row).toBeVisible();

  const bounds = await box(container);
  const rowAtRest = await box(row);
  const labelAtRest = await box(label);

  await row.hover();
  await expect(row.locator('.fb-chat-row-actions__trigger')).toHaveCSS('opacity', '1');

  const rowHovered = await box(row);
  const labelHovered = await box(label);

  expect(rowHovered, 'hovered row keeps its place').toEqual(rowAtRest);
  expect(rowHovered.left).toBeGreaterThanOrEqual(bounds.left);
  expect(rowHovered.right).toBeLessThanOrEqual(bounds.right);
  expect(labelHovered.left - labelAtRest.left, 'label slides 4px').toBeCloseTo(4, 1);

  await page.mouse.move(bounds.right + 200, 10);
  await expect.poll(async () => (await box(label)).left).toBeCloseTo(labelAtRest.left, 1);
}

test('a hovered Recents row stays inside the sidebar and slides only its label', async ({
  page,
}) => {
  await open(page);

  const row = page.locator('.fb-recent-chats__item').first();

  await expectRowStaysInside(page, {
    container: page.locator('#frogbot-nav-section-recents .fb-nav-section__scroll'),
    row,
    label: row.locator('.fb-nav-item__label'),
  });
});

test('a hovered Chats page row stays inside the list and slides only its label', async ({
  page,
}) => {
  await open(page);

  const row = page.locator('.fb-chat-history__item').first();

  await expectRowStaysInside(page, {
    container: page.locator('.fb-chat-history'),
    row,
    label: row.locator('.fb-chat-history__button'),
  });
});
