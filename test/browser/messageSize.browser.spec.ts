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
    buildGallery(path.join(import.meta.dirname, 'fixtures', 'ui-parity', 'message-size.tsx')),
    stylesheet([...standaloneStack, fontsCss]),
  ]);
});

const selectors = {
  user: '.fb-message--user .fb-markdown__paragraph',
  assistant: '.fb-message--assistant .fb-markdown__paragraph',
  timestamp: '.fb-message-actions__timestamp',
  button: '.fb-message-actions__button',
  icon: '.fb-message-actions__icon',
  actions: '.fb-message-actions',
};

test('message text is 14px and message actions are 16px with a 10px gap', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await renderGallery(page, { css, js, theme: 'light', admin: false });

  const read = () =>
    page.evaluate((selectors) => {
      const all = (selector: string) => [...document.querySelectorAll(selector)];

      return Object.fromEntries(
        Object.entries(selectors).map(([name, selector]) => [
          name,
          all(selector).map((element) => {
            const style = getComputedStyle(element);
            const { width, height } = element.getBoundingClientRect();

            return {
              width,
              height,
              fontSize: style.fontSize,
              gap: style.columnGap,
              paddingInline: [style.paddingLeft, style.paddingRight],
            };
          }),
        ]),
      );
    }, selectors);

  const measured = await read();

  for (const [name, elements] of Object.entries(measured)) {
    expect(elements.length, `${name} matches`).toBeGreaterThan(0);
  }

  for (const paragraph of [...measured.user, ...measured.assistant]) {
    expect(paragraph.fontSize).toBe('14px');
  }

  expect(measured.timestamp).toHaveLength(2);

  for (const timestamp of measured.timestamp) {
    expect(timestamp.fontSize).toBe('12px');
    expect(timestamp.paddingInline).toEqual(['0px', '0px']);
  }

  for (const box of [...measured.button, ...measured.icon]) {
    expect(box.width).toBeCloseTo(16, 0);
    expect(box.height).toBeCloseTo(16, 0);
  }

  expect(measured.icon).toHaveLength(measured.button.length);

  for (const actions of measured.actions) expect(actions.gap).toBe('10px');

  await page.evaluate(() => {
    document.documentElement.style.fontSize = '20px';
  });

  const scaled = await read();

  for (const paragraph of scaled.user) expect(paragraph.fontSize).toBe('17.5px');
});
