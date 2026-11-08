import { expect, test } from '@playwright/test';

import { adminStack, stylesheet } from './fixtures/ui-parity/build';

let css = '';

test.beforeAll(async () => {
  css = await stylesheet(adminStack);
});

const toolbar = `
  <div class="list-controls">
    <div class="list-controls__search-row">
      <div class="list-controls__left"><input class="search" placeholder="Search" /></div>
      <div class="list-controls__spacer"></div>
      <div class="list-controls__actions"><button class="btn">Filters</button></div>
    </div>
    <div class="list-controls__where">
      <div class="where-builder">
        <ul class="where-builder__or-filters">
          <li class="where-builder__and-filters"><input class="where-builder__field" /></li>
        </ul>
        <button class="btn where-builder__add-or">Add Filter</button>
      </div>
    </div>
  </div>`;

for (const theme of ['light', 'dark'] as const) {
  for (const width of [390, 1280]) {
    test(`the open Filters panel draws one line under the toolbar (${theme}, ${width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });

      await page.setContent(
        `<!doctype html><html data-theme="${theme}"><head><style>${css}</style></head><body style="margin:0">${toolbar}</body></html>`,
      );

      const layout = await page.evaluate(() => {
        const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
        const lines = [
          ...document.querySelectorAll('.list-controls, .list-controls div, .list-controls ul'),
        ].filter((element) => parseFloat(getComputedStyle(element).borderBottomWidth) > 0);

        return {
          lines: lines.map((element) => element.className),
          searchLeft: box('.list-controls__search-row').left,
          filterLeft: box('.where-builder__or-filters').left,
          filterRight: box('.where-builder__or-filters').right,
          searchRight: box('.list-controls__search-row').right,
          addFilterBottom: box('.where-builder__add-or').bottom,
          toolbarBottom: box('.list-controls').bottom,
        };
      });

      expect(layout.lines).toEqual(['list-controls']);
      expect(layout.filterLeft).toBe(layout.searchLeft);
      expect(layout.filterRight).toBe(layout.searchRight);
      expect(layout.toolbarBottom).toBeGreaterThan(layout.addFilterBottom);
    });
  }
}
