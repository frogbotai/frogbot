import path from 'node:path';

import { expect, test } from '@playwright/test';

import {
  buildGallery,
  renderGallery,
  standaloneStack,
  stylesheet,
} from './fixtures/ui-parity/build';

let js = '';
let css = '';

test.beforeAll(async () => {
  [js, css] = await Promise.all([
    buildGallery(path.join(import.meta.dirname, 'fixtures', 'ui-parity', 'list-controls.tsx')),
    stylesheet(standaloneStack),
  ]);
});

const controls = [
  'Meta checkbox',
  'Meta select',
  'Meta label',
  'Meta role button',
  'Subtitle checkbox',
];

test('controls in a linked row’s subtitle and meta sit above the row link', async ({ page }) => {
  await renderGallery(page, { css, js, theme: 'light', admin: false });

  const hits = await page.evaluate((names) => {
    const find = (name: string) =>
      [...document.querySelectorAll<HTMLElement>('input, select, label, [role="button"]')].find(
        (element) =>
          element.getAttribute('aria-label') === name || element.textContent?.trim() === name,
      )!;

    return names.map((name) => {
      const element = find(name);
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);

      return { name, onControl: Boolean(hit && (hit === element || element.contains(hit))) };
    });
  }, controls);

  expect(hits).toEqual(controls.map((name) => ({ name, onControl: true })));

  await page.getByLabel('Meta checkbox').click();
  await expect(page.getByLabel('Meta checkbox')).toBeChecked();
  expect(await page.evaluate(() => location.hash)).toBe('');

  const title = await page.locator('.fb-list__title').boundingBox();

  await page.mouse.click(title!.x + 4, title!.y + title!.height / 2);
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#row');
});
