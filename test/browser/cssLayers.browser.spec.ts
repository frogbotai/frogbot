import { expect, type Locator, type Page, test } from '@playwright/test';

import { expectBackground, openMenu, openPostCreate, readAdminColor } from './__helpers/adminTheme';

const appPage = '/theme-check/layers';
const buttonOverride = 'rgb(11, 22, 33)';
const menuOverride = 'rgb(44, 55, 66)';
const dialogOverride = 'rgb(77, 88, 99)';
const rootOverride = `:root { --theme-base-1000: ${buttonOverride}; --theme-base-50: ${menuOverride}; --theme-base-0: ${dialogOverride}; }`;
const probeColor = 'rgb(1, 2, 3)';

function readLayers(page: Page) {
  return page.evaluate(() => {
    const order: string[] = [];
    const frogbotSelectors: string[] = [];

    const visit = (rules: CSSRuleList, layer: string | null) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSImportRule) {
          if (rule.styleSheet) visit(rule.styleSheet.cssRules, layer);

          continue;
        }

        if (rule instanceof CSSLayerStatementRule) {
          if (layer === null) order.push(...rule.nameList);

          continue;
        }

        if (rule instanceof CSSLayerBlockRule) {
          if (layer === null) order.push(rule.name);

          visit(rule.cssRules, layer ?? rule.name);

          continue;
        }

        if (rule instanceof CSSStyleRule && layer === 'frogbot') {
          frogbotSelectors.push(rule.selectorText);
        }

        if ('cssRules' in rule) visit((rule as CSSGroupingRule).cssRules, layer);
      }
    };

    for (const sheet of Array.from(document.styleSheets)) {
      visit(sheet.cssRules, null);
    }

    return {
      order: order.filter((name, index) => order.indexOf(name) === index),
      frogbotSelectors,
    };
  });
}

function readColors(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);

    return { backgroundColor: style.backgroundColor, color: style.color };
  });
}

function readStyle(locator: Locator, property: string) {
  return locator.evaluate(
    (element, name) => getComputedStyle(element).getPropertyValue(name),
    property,
  );
}

async function expectUtilitiesWin(page: Page) {
  const reference = await readColors(page.getByTestId('layer-utility-reference').first());
  const designed = await readColors(page.getByTestId('layer-default').first());

  expect(reference).not.toEqual(designed);
  expect(await readColors(page.getByTestId('layer-utility').first())).toEqual(reference);
  await expect(page.getByTestId('layer-utility-link').first()).toHaveCSS(
    'text-decoration-line',
    'underline',
  );
}

async function expectOverlayBackground(page: Page, prefix: string, expected: string) {
  const menu = await openMenu(page, prefix);

  await expectBackground(menu, expected);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
}

async function expectPageOverride(page: Page) {
  await expectBackground(page.getByTestId('layer-default').first(), buttonOverride);
  await expectOverlayBackground(page, 'layer-menu', menuOverride);
  await expectOverlayBackground(page, 'layer-dark-menu', menuOverride);
  await page.getByTestId('layer-dialog-trigger').first().click();

  const dialog = page.getByTestId('layer-dialog');

  await expect(dialog).toBeVisible();
  await expectBackground(dialog, dialogOverride);
}

async function expectSectionOverrideStaysInline(page: Page) {
  await page.addStyleTag({ content: `.billing { --theme-base-50: ${menuOverride}; }` });

  const menu = await openMenu(page, 'layer-billing-menu');

  expect((await readColors(menu)).backgroundColor).not.toBe(menuOverride);
}

async function expectUnlayeredRulesWin(page: Page) {
  await page.addStyleTag({
    content: `a { text-decoration: underline; } button { background: ${probeColor}; }`,
  });

  await expect(page.getByTestId('layer-link').first()).toHaveCSS(
    'text-decoration-line',
    'underline',
  );

  await expectBackground(page.getByTestId('layer-default').first(), probeColor);
}

test.describe('FrogBot CSS layer in the admin', () => {
  test.beforeEach(async ({ page }) => {
    await openPostCreate(page, 'light');
    await expect(page.getByTestId('layer-probe').first()).toBeVisible();
  });

  test('declares frogbot between payload-default and payload, before the app layers', async ({
    page,
  }) => {
    const { order } = await readLayers(page);

    expect(order.slice(0, 7)).toEqual([
      'payload-default',
      'frogbot',
      'payload',
      'theme',
      'base',
      'components',
      'utilities',
    ]);
  });

  test('a payload layer rule beats FrogBot and a payload-default rule does not', async ({
    page,
  }) => {
    const button = page.getByTestId('layer-default').first();
    const designed = await readStyle(button, 'color');

    await page.addStyleTag({
      content: `@layer payload-default { .fb-button { color: ${probeColor}; } }`,
    });

    await expect(button).toHaveCSS('color', designed);

    await page.addStyleTag({ content: `@layer payload { .fb-button { color: ${probeColor}; } }` });
    await expect(button).toHaveCSS('color', probeColor);
  });

  test('Tailwind utilities beat FrogBot components', async ({ page }) => {
    await expectUtilitiesWin(page);
  });

  test('unlayered app CSS beats FrogBot', async ({ page }) => {
    await expectUnlayeredRulesWin(page);
  });

  test('a :root token override reaches buttons, menus, dark sections and dialogs', async ({
    page,
  }) => {
    await page.addStyleTag({ content: rootOverride });
    await expectPageOverride(page);
  });

  test('a section token override does not reach its overlays', async ({ page }) => {
    await expectSectionOverrideStaysInline(page);
  });

  test('the account menu restyle still applies', async ({ page }) => {
    await page.locator('button[aria-label="Account"]').click();

    const menu = page.locator('.frogbot-account-menu.fb-dropdown-menu__content');

    await expect(menu).toBeVisible();
    await expect(menu).toHaveCSS('border-radius', '12px');
    await expect(menu).toHaveCSS('min-width', '240px');
  });

  test('the Connections restyles still apply', async ({ page }) => {
    await expect(page.getByTestId('theme-probe-nested-button').first()).toHaveCSS(
      'align-self',
      'flex-start',
    );
    await expect(
      page.locator('.frogbot-connections__toolbar > .fb-search-input').first(),
    ).toHaveCSS('flex-grow', '1');
  });

  test('the Connections search keeps the shared search look', async ({ page }) => {
    const search = page.locator('.frogbot-connections__toolbar > .fb-search-input').first();

    await expectBackground(search, await readAdminColor(page, '--theme-base-150'));
    await expect(search).toHaveCSS('border-top-width', '0px');

    await openPostCreate(page, 'dark');

    await expectBackground(search, await readAdminColor(page, '--theme-base-150'));
    await expect(search).toHaveCSS('border-top-width', '0px');
  });

  test('admin CSS loaded after a client navigation keeps the layer order', async ({ page }) => {
    await page.goto('/');
    await page.locator('.frogbot-nav-shell a[href$="/collections/posts"]').first().click();
    await page.waitForURL(/\/collections\/posts$/);
    await expect(page.locator('.collection-list')).toBeVisible();

    const { frogbotSelectors, order } = await readLayers(page);

    expect(order.slice(0, 3)).toEqual(['payload-default', 'frogbot', 'payload']);
    expect(frogbotSelectors).toContain('.collection-list');
  });
});

test.describe('FrogBot CSS layer on app pages', () => {
  for (const path of ['/tw/frogbot-first', '/tw/layer-line']) {
    test(`Tailwind utilities beat FrogBot components on ${path}`, async ({ page }) => {
      await page.goto(path);
      await expectUtilitiesWin(page);
    });
  }

  test('Tailwind utilities lose when Tailwind loads first without the layer line', async ({
    page,
  }) => {
    await page.goto('/tw/no-line');

    const reference = await readColors(page.getByTestId('layer-utility-reference'));
    const utility = await readColors(page.getByTestId('layer-utility'));

    expect(utility).not.toEqual(reference);
    expect(utility).toEqual(await readColors(page.getByTestId('layer-default')));
  });

  test('Tailwind Preflight does not reset FrogBot buttons', async ({ page }) => {
    await page.goto('/tw/frogbot-first');
    await expectBackground(page.getByTestId('layer-default'), 'rgb(1, 3, 10)');
  });

  test('a Tailwind @theme static override reaches buttons, menus, dark sections and dialogs', async ({
    page,
  }) => {
    await page.goto('/tw/theme');
    await expectPageOverride(page);
  });

  test('unlayered app CSS beats FrogBot', async ({ page }) => {
    await page.goto(appPage);
    await expectUnlayeredRulesWin(page);
  });

  test('a :root token override reaches buttons, menus, dark sections and dialogs', async ({
    page,
  }) => {
    await page.goto(appPage);
    await page.addStyleTag({ content: rootOverride });
    await expectPageOverride(page);
  });

  test('a section token override does not reach its overlays', async ({ page }) => {
    await page.goto(appPage);
    await expectSectionOverrideStaysInline(page);
  });
});
