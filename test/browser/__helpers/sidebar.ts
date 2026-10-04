import { expect, type Locator, type Page } from '@playwright/test';

type NavStateWindow = Window & { __frogbotNavStates?: string[] };

export async function expandSidebar(page: Page) {
  const shell = page.locator('.frogbot-nav-shell');

  if ((await shell.getAttribute('data-nav-state')) === 'desktop-nav-closed') {
    await page.click('button[aria-label="Open sidebar"]');
    await expect(shell).toHaveAttribute('data-nav-state', 'desktop-nav-open');
  }
}

export const collectionNavIcon = (page: Page, slug: string) =>
  page.locator(`#frogbot-nav-section-collections a[href="/collections/${slug}"] svg`);

export const iconStroke = (icon: Locator) =>
  icon.evaluate((svg) => {
    const style = getComputedStyle(svg);
    const box = (svg as SVGSVGElement).viewBox.baseVal;

    const drawn =
      svg.getBoundingClientRect().width -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight);

    const shapes = [
      ...svg.querySelectorAll('circle, ellipse, line, path, polygon, polyline, rect'),
    ].map((shape) => getComputedStyle(shape));

    return {
      px: (parseFloat(style.strokeWidth) * drawn) / Math.max(box.width, box.height),
      root: style.strokeWidth,
      widths: shapes.map((shape) => shape.strokeWidth),
      effects: shapes.map((shape) => shape.vectorEffect),
    };
  });

export async function expectTwoPixelStroke(icon: Locator) {
  const { px, root, widths, effects } = await iconStroke(icon);
  const label = String(icon);

  expect(px, label).toBeCloseTo(2, 2);
  expect(widths, label).toEqual(widths.map(() => root));
  expect(effects, label).toEqual(effects.map(() => 'none'));
}

export async function setNavPreference(page: Page, open: boolean) {
  const response = await page.request.post('/api/payload-preferences/nav', {
    data: { value: { open } },
  });

  expect(response.ok()).toBe(true);
}

export const waitForNavPreferenceSave = (page: Page) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/payload-preferences/nav',
  );

export async function recordNavStates(page: Page) {
  await page.addInitScript(() => {
    const states: string[] = [];

    const record = (state: string | null | undefined) => {
      if (state && states.at(-1) !== state) states.push(state);
    };

    (window as NavStateWindow).__frogbotNavStates = states;

    new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        const target = mutation.target as Element;

        if (mutation.type === 'attributes' && target.classList.contains('frogbot-nav-shell')) {
          record(mutation.oldValue);
        }
      });

      record(document.querySelector('.frogbot-nav-shell')?.getAttribute('data-nav-state'));
    }).observe(document, {
      attributeFilter: ['data-nav-state'],
      attributeOldValue: true,
      attributes: true,
      childList: true,
      subtree: true,
    });
  });
}

export const navStates = (page: Page) =>
  page.evaluate(() => (window as NavStateWindow).__frogbotNavStates ?? []);

export async function waitForNavSettled(page: Page) {
  await expect(page.locator('.frogbot-nav-shell')).toHaveAttribute('data-nav-hydrated', 'true');

  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}
