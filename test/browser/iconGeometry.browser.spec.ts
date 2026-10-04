import { expect, type Page, test } from '@playwright/test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { excludedIcons, type LoadedIcon, loadIcons } from '../__helpers/shared/icons';

type IconGeometry = { name: string; overflow: number; offset: { x: number; y: number } };

const tolerance = 0.05;

let loadedIcons: LoadedIcon[] = [];

test.beforeAll(async () => {
  loadedIcons = await loadIcons();
});

async function measureIcons(page: Page): Promise<IconGeometry[]> {
  const markup = loadedIcons
    .map(
      ({ name, Component }) =>
        `<div data-icon="${name}">${renderToStaticMarkup(createElement(Component, { size: 96 }))}</div>`,
    )
    .join('');

  await page.setContent(`<!doctype html><body>${markup}</body>`);

  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-icon]')].map((wrapper) => {
      const svg = wrapper.querySelector('svg')!;
      const box = svg.viewBox.baseVal;
      const painted = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };

      const shapes = svg.querySelectorAll<SVGGraphicsElement>(
        'circle, ellipse, line, path, polygon, polyline, rect',
      );

      for (const shape of shapes) {
        const bounds = shape.getBBox();
        const style = getComputedStyle(shape);
        const half = style.stroke === 'none' ? 0 : parseFloat(style.strokeWidth) / 2;

        painted.left = Math.min(painted.left, bounds.x - half);
        painted.top = Math.min(painted.top, bounds.y - half);
        painted.right = Math.max(painted.right, bounds.x + bounds.width + half);
        painted.bottom = Math.max(painted.bottom, bounds.y + bounds.height + half);
      }

      const overflow = Math.max(
        0,
        box.x - painted.left,
        box.y - painted.top,
        painted.right - (box.x + box.width),
        painted.bottom - (box.y + box.height),
      );

      return {
        name: wrapper.dataset.icon!,
        overflow,
        offset: {
          x: (painted.left + painted.right) / 2 - (box.x + box.width / 2),
          y: (painted.top + painted.bottom) / 2 - (box.y + box.height / 2),
        },
      };
    }),
  );
}

const round = (units: number) => Number(units.toFixed(2));

test('no stroked icon draws outside its box', async ({ page }) => {
  const geometry = await measureIcons(page);

  const overflowing = geometry
    .filter(({ name, overflow }) => !(name in excludedIcons) && overflow > tolerance)
    .map(({ name, overflow }) => `${name} overflows by ${round(overflow)} units`);

  expect(overflowing).toEqual([]);
});

test('InvalidStepIcon, StoplightIcon and XIcon are centred', async ({ page }) => {
  const geometry = await measureIcons(page);
  const centred = ['InvalidStepIcon', 'StoplightIcon', 'XIcon'];

  const offCentre = geometry
    .filter(({ name }) => centred.includes(name))
    .filter(({ offset }) => Math.abs(offset.x) > tolerance || Math.abs(offset.y) > tolerance)
    .map(({ name, offset }) => `${name} is off centre by (${round(offset.x)}, ${round(offset.y)})`);

  expect(offCentre).toEqual([]);
});
