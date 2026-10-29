import path from 'node:path';

import { expect, test } from '@playwright/test';

import {
  buildGallery,
  fontsCss,
  renderGallery,
  standaloneStack,
  stylesheet,
} from './fixtures/ui-parity/build';

let js = '';
let css = '';

test.beforeAll(async () => {
  [js, css] = await Promise.all([
    buildGallery(path.join(import.meta.dirname, 'fixtures', 'ui-parity', 'composer-size.tsx')),
    stylesheet([...standaloneStack, fontsCss]),
  ]);
});

const round = ['.fb-composer__end > *', '.fb-attachments__add', '.fb-mic-control__button'];
const pickers = ['.fb-model-selector__trigger', '.fb-composer-select__trigger'];

for (const width of [1280, 375]) {
  test(`composer controls are 32px with an 8px gap under the text at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await renderGallery(page, { css, js, theme: 'light', admin: false });
    await expect(page.locator('.fb-mic-control__button')).toHaveCount(2);
    await expect(page.locator('.fb-attachments__add')).toHaveCount(2);
    await expect(page.locator('.fb-composer__stop')).toHaveCount(1);
    await expect(page.locator('.fb-composer__submit')).toHaveCount(1);

    const sizes = await page.evaluate(
      ({ round, pickers }) => {
        const measure = (selector: string) =>
          [...document.querySelectorAll(selector)].map((element) => {
            const { width, height } = element.getBoundingClientRect();

            return { width, height };
          });

        return {
          round: Object.fromEntries(round.map((selector) => [selector, measure(selector)])),
          pickers: Object.fromEntries(pickers.map((selector) => [selector, measure(selector)])),
          controls: measure('.fb-composer__controls'),
          gaps: [...document.querySelectorAll('.fb-composer__panel')].map(
            (panel) =>
              panel.querySelector('.fb-composer__controls')!.getBoundingClientRect().top -
              panel.querySelector('.fb-composer__input')!.getBoundingClientRect().bottom,
          ),
        };
      },
      { round, pickers },
    );

    for (const [selector, boxes] of Object.entries(sizes.round)) {
      expect(boxes.length, selector).toBeGreaterThan(0);

      for (const box of boxes) {
        expect(box.width, `${selector} width`).toBeCloseTo(32, 0);
        expect(box.height, `${selector} height`).toBeCloseTo(32, 0);
      }
    }

    for (const [selector, boxes] of Object.entries(sizes.pickers)) {
      expect(boxes.length, selector).toBeGreaterThan(0);

      for (const box of boxes) expect(box.height, `${selector} height`).toBeCloseTo(32, 0);
    }

    expect(sizes.controls).toHaveLength(2);

    for (const box of sizes.controls) expect(box.height, 'controls height').toBeCloseTo(32, 0);

    expect(sizes.gaps).toHaveLength(2);

    for (const gap of sizes.gaps) expect(gap, 'gap under the text').toBeCloseTo(8, 0);
  });
}
