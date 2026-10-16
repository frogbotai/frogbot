import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

const css = (file: string) =>
  readFileSync(new URL(`../../packages/ui/src/${file}`, import.meta.url), 'utf8');

test('fb- elements are border-box without a host reset, other classes keep content-box', async ({
  page,
}) => {
  await page.setContent(
    `<!doctype html><body>
      <div class="fb-alert" style="width: 100px; padding: 10px">Alert</div>
      <div class="note fb-alert" style="width: 100px; padding: 10px">Second token</div>
      <div class="xfb-foo" style="width: 100px; padding: 10px">Other</div>
    </body>`,
  );

  await page.addStyleTag({ content: css('layers.css') });
  await page.addStyleTag({ content: css('base.css') });
  await page.addStyleTag({ content: css('components/alert.css') });

  const measured = await page.evaluate(() =>
    [...document.body.children].map((element) => ({
      className: element.className,
      boxSizing: getComputedStyle(element).boxSizing,
      before: getComputedStyle(element, '::before').boxSizing,
      width: element.getBoundingClientRect().width,
    })),
  );

  expect(measured).toEqual([
    { className: 'fb-alert', boxSizing: 'border-box', before: 'border-box', width: 100 },
    { className: 'note fb-alert', boxSizing: 'border-box', before: 'border-box', width: 100 },
    { className: 'xfb-foo', boxSizing: 'content-box', before: 'content-box', width: 120 },
  ]);
});

test('app styles override the reset without extra specificity', async ({ page }) => {
  await page.setContent('<!doctype html><body><div class="fb-alert">Alert</div></body>');
  await page.addStyleTag({ content: css('layers.css') });
  await page.addStyleTag({ content: css('base.css') });
  await page.addStyleTag({ content: 'div { box-sizing: content-box; }' });

  expect(
    await page.locator('.fb-alert').evaluate((element) => getComputedStyle(element).boxSizing),
  ).toBe('content-box');
});
