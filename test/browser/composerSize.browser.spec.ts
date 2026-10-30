import path from 'node:path';

import { expect, test } from '@playwright/test';

import {
  adminStack,
  buildGallery,
  fontsCss,
  renderGallery,
  standaloneStack,
  stylesheet,
} from './fixtures/ui-parity/build';

let js = '';
const css = { standalone: '', admin: '' };

test.beforeAll(async () => {
  [js, css.standalone, css.admin] = await Promise.all([
    buildGallery(path.join(import.meta.dirname, 'fixtures', 'ui-parity', 'composer-size.tsx')),
    stylesheet([...standaloneStack, fontsCss]),
    stylesheet([...adminStack, fontsCss]),
  ]);
});

const round = [
  '.fb-composer__end > *',
  '.fb-attachments__add',
  '.fb-mic-control__button',
  '.fb-page-context-button__trigger',
];

const pickers = [
  '.fb-model-selector__trigger',
  '.fb-composer-select__trigger',
  '.fb-tool-selector__trigger',
];

const icons = [
  '.fb-composer__action-icon',
  '.fb-attachments__add-icon',
  '.fb-mic-control__icon',
  '.fb-page-context-button__trigger-icon',
  '.fb-tool-selector__trigger-icon',
  '.fb-composer-select__trigger .fb-composer-select__icon',
];

for (const host of ['standalone', 'admin'] as const) {
  for (const width of [1280, 375]) {
    test(`${host} composer controls are 28px with 18px icons and an 8px gap under the text at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await renderGallery(page, { css: css[host], js, theme: 'light', admin: host === 'admin' });
      await expect(page.locator('.fb-mic-control__button')).toHaveCount(2);
      await expect(page.locator('.fb-attachments__add')).toHaveCount(2);
      await expect(page.locator('.fb-composer__stop')).toHaveCount(1);
      await expect(page.locator('.fb-composer__submit')).toHaveCount(1);

      const sizes = await page.evaluate(
        ({ round, pickers, icons }) => {
          const measure = (selector: string) =>
            [...document.querySelectorAll(selector)].map((element) => {
              const { width, height } = element.getBoundingClientRect();

              return { width, height };
            });

          const each = (selectors: string[]) =>
            Object.fromEntries(selectors.map((selector) => [selector, measure(selector)]));

          return {
            round: each(round),
            pickers: each(pickers),
            icons: each(icons),
            controls: measure('.fb-composer__controls'),
            fontSizes: [...document.querySelectorAll('.fb-composer__input')].map(
              (input) => getComputedStyle(input).fontSize,
            ),
            gaps: [...document.querySelectorAll('.fb-composer__panel')].map(
              (panel) =>
                panel.querySelector('.fb-composer__controls')!.getBoundingClientRect().top -
                panel.querySelector('.fb-composer__input')!.getBoundingClientRect().bottom,
            ),
          };
        },
        { round, pickers, icons },
      );

      for (const [selector, boxes] of Object.entries(sizes.round)) {
        expect(boxes.length, selector).toBeGreaterThan(0);

        for (const box of boxes) {
          expect(box.width, `${selector} width`).toBeCloseTo(28, 0);
          expect(box.height, `${selector} height`).toBeCloseTo(28, 0);
        }
      }

      for (const [selector, boxes] of Object.entries(sizes.pickers)) {
        expect(boxes.length, selector).toBeGreaterThan(0);

        for (const box of boxes) expect(box.height, `${selector} height`).toBeCloseTo(28, 0);
      }

      for (const [selector, boxes] of Object.entries(sizes.icons)) {
        expect(boxes.length, selector).toBeGreaterThan(0);

        for (const box of boxes) {
          expect(box.width, `${selector} width`).toBeCloseTo(18, 0);
          expect(box.height, `${selector} height`).toBeCloseTo(18, 0);
        }
      }

      expect(sizes.controls).toHaveLength(2);

      for (const box of sizes.controls) expect(box.height, 'controls height').toBeCloseTo(28, 0);

      expect(sizes.fontSizes).toEqual(['14px', '14px']);
      expect(sizes.gaps).toHaveLength(2);

      for (const gap of sizes.gaps) expect(gap, 'gap under the text').toBeCloseTo(8, 0);
    });
  }
}

test('the stop icon has no white stroke and the button shows a ring only on keyboard focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await renderGallery(page, { css: css.standalone, js, theme: 'light', admin: false });

  const stop = page.locator('.fb-composer__stop');
  const paint = () =>
    stop.locator('svg').evaluate((icon) => {
      const style = getComputedStyle(icon);

      return { fill: style.fill, stroke: style.stroke };
    });

  const outline = () =>
    stop.evaluate((button) => {
      const style = getComputedStyle(button);

      return { style: style.outlineStyle, width: style.outlineWidth };
    });

  const atRest = await paint();
  expect(atRest.stroke).toBe(atRest.fill);

  await stop.hover();
  const hovered = await paint();
  expect(hovered.stroke).toBe(hovered.fill);

  await stop.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(stop).toBeFocused();
  expect(await outline()).toEqual({ style: 'solid', width: '2px' });

  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await stop.click();
  await expect(stop).toBeFocused();
  expect((await outline()).style).toBe('none');
});
