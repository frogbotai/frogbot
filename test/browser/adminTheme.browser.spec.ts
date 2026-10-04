import { expect, type Locator, type Page, test } from '@playwright/test';

import {
  type AdminTheme,
  expectBackground,
  openMenu,
  openPostCreate,
  readAdminColor,
} from './__helpers/adminTheme';
import { signedOut } from './__helpers/signIn';

function readRootProperty(page: Page, name: string) {
  return page.evaluate(
    (property) => getComputedStyle(document.documentElement).getPropertyValue(property),
    name,
  );
}

async function readAdminPalette(page: Page) {
  return {
    base0: await readAdminColor(page, '--color-base-0'),
    base500: await readAdminColor(page, '--color-base-500'),
    base1000: await readAdminColor(page, '--color-base-1000'),
  };
}

test.describe('FrogBot UI in the admin', () => {
  test('styles admin slot components with the light admin palette', async ({ page }) => {
    await openPostCreate(page, 'light');

    await expectBackground(
      page.getByTestId('theme-probe-default').first(),
      await readAdminColor(page, '--color-base-1000'),
    );
    await expectBackground(
      page.getByTestId('theme-probe-secondary').first(),
      await readAdminColor(page, '--color-base-250'),
    );
  });

  test('styles admin slot components with the dark admin palette', async ({ page }) => {
    await openPostCreate(page, 'dark');

    await expectBackground(
      page.getByTestId('theme-probe-default').first(),
      await readAdminColor(page, '--color-base-0'),
    );
    await expectBackground(
      page.getByTestId('theme-probe-secondary').first(),
      await readAdminColor(page, '--color-base-750'),
    );
  });

  test('follows an admin theme switch without a reload', async ({ page }) => {
    await openPostCreate(page, 'light');
    await expect(page.getByTestId('theme-probe-default').first()).toBeVisible();
    await page.evaluate(() => {
      (window as { themeProbeMarker?: boolean }).themeProbeMarker = true;
    });

    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));

    await expectBackground(
      page.getByTestId('theme-probe-default').first(),
      await readAdminColor(page, '--color-base-0'),
    );
    await expectBackground(
      page.getByTestId('theme-probe-secondary').first(),
      await readAdminColor(page, '--color-base-750'),
    );
    expect(
      await page.evaluate(() => (window as { themeProbeMarker?: boolean }).themeProbeMarker),
    ).toBe(true);
  });

  test('styles components inside a document drawer', async ({ page }) => {
    await openPostCreate(page, 'light');
    await page.locator('#relatedPost-add-new .relationship-add-new__add-button').click();

    const drawerButton = page.locator('.drawer__content').getByTestId('theme-probe-default');

    await expect(drawerButton).toBeVisible();
    await expectBackground(drawerButton, await readAdminColor(page, '--color-base-1000'));
  });

  for (const [theme, pageBackground] of [
    ['light', 'rgb(255, 255, 255)'],
    ['dark', 'rgb(20, 20, 20)'],
  ] as const) {
    test(`leaves the ${theme} admin's own palette in place`, async ({ page }) => {
      await openPostCreate(page, theme);
      await expect(page.locator('html')).toHaveAttribute('data-fb-ui-page', '');
      await expect(page.getByTestId('theme-probe-default').first()).toBeVisible();

      expect(await readAdminPalette(page)).toEqual({
        base0: 'rgb(255, 255, 255)',
        base500: 'rgb(128, 128, 128)',
        base1000: 'rgb(0, 0, 0)',
      });
      expect(await readRootProperty(page, '--font-body')).toMatch(/^-apple-system,/);
      await expect(page.locator('html')).toHaveCSS('background-color', pageBackground);
    });
  }

  test('resolves portal colors to the admin palette', async ({ page }) => {
    await openPostCreate(page, 'light');

    const menu = await openMenu(page, 'theme-probe-menu');
    const portalBase0 = await menu.evaluate((element) =>
      getComputedStyle(element.closest('.fb-portal')!).getPropertyValue('--color-base-0'),
    );

    expect(portalBase0).not.toBe('');
    expect(portalBase0).toBe(await readRootProperty(page, '--color-base-0'));
  });

  test('ignores a leftover data-fb-theme value in portals', async ({ page }) => {
    await openPostCreate(page, 'dark');
    await page.evaluate(() => document.documentElement.setAttribute('data-fb-theme', 'light'));

    const menu = await openMenu(page, 'theme-probe-menu');

    await expectBackground(menu, await readAdminColor(page, '--color-base-950'));
    expect(
      await menu.evaluate(
        (element) => getComputedStyle(element.closest('.fb-portal')!).colorScheme,
      ),
    ).toBe('dark');
  });

  test('keeps a developer ThemeProvider set to dark inside a light admin', async ({ page }) => {
    await openPostCreate(page, 'light');
    await expect(page.locator('html')).toHaveAttribute('data-fb-theme', 'dark');

    await expectBackground(
      page.getByTestId('theme-probe-dark-default').first(),
      await readAdminColor(page, '--color-base-0'),
    );

    const darkMenu = await openMenu(page, 'theme-probe-dark-menu');

    await expectBackground(darkMenu, await readAdminColor(page, '--color-base-950'));
    await page.keyboard.press('Escape');
    await expect(darkMenu).toBeHidden();

    const pageMenu = await openMenu(page, 'theme-probe-menu');

    await expectBackground(pageMenu, await readAdminColor(page, '--color-base-50'));
  });

  test('lets an app override a FrogBot token on :root', async ({ page }) => {
    await openPostCreate(page, 'light');

    const code = page.getByTestId('theme-probe-code').first();
    const defaultRadius = await code.evaluate((element) => getComputedStyle(element).borderRadius);

    expect(defaultRadius).not.toMatch(/^(0px|2px)$/);
    await page.addStyleTag({ content: ':root { --fb-radius: 2px; }' });
    await expect(code).toHaveCSS('border-radius', '2px');
  });

  test('colors user code blocks with the admin theme', async ({ page }) => {
    await openPostCreate(page, 'light');

    const code = page.getByTestId('theme-probe-code').first();

    await expectBackground(code, await readAdminColor(page, '--color-base-50'));
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await expectBackground(code, await readAdminColor(page, '--color-base-250'));
  });

  test.describe('on a light operating system', () => {
    test.use({ colorScheme: 'light' });

    test('opens dropdown menus with the dark admin palette', async ({ page }) => {
      await openPostCreate(page, 'dark');
      await page.getByTestId('theme-probe-menu-trigger').first().click();

      const menu = page.getByTestId('theme-probe-menu');

      await expect(menu).toBeVisible();
      await expectBackground(menu, await readAdminColor(page, '--color-base-950'));
    });
  });

  test.describe('on a dark operating system', () => {
    test.use({ colorScheme: 'dark' });

    test('opens dropdown menus with the light admin palette', async ({ page }) => {
      await openPostCreate(page, 'light');
      await page.getByTestId('theme-probe-menu-trigger').first().click();

      const menu = page.getByTestId('theme-probe-menu');

      await expect(menu).toBeVisible();
      await expectBackground(menu, await readAdminColor(page, '--color-base-50'));
    });
  });
});

test('keeps the FrogBot palette on pages outside the admin', async ({ page }) => {
  await page.goto('/theme-check');

  const button = page.getByTestId('theme-check-default');

  await expect(button).toBeVisible();
  await expectBackground(button, 'rgb(1, 3, 10)');
  await expect(page.locator('html')).not.toHaveAttribute('data-fb-ui-page');
  expect(
    await page.evaluate(() => {
      const color = (name: string, colorScheme = '') => {
        const sample = document.createElement('div');

        sample.style.colorScheme = colorScheme;
        sample.style.backgroundColor = `var(${name})`;
        document.body.append(sample);

        const value = getComputedStyle(sample).backgroundColor;

        sample.remove();

        return value;
      };

      return {
        base0: color('--color-base-0'),
        themeBase0: {
          light: color('--theme-base-0', 'light'),
          dark: color('--theme-base-0', 'dark'),
        },
      };
    }),
  ).toEqual({
    base0: 'rgb(249, 250, 251)',
    themeBase0: { light: 'rgb(249, 250, 251)', dark: 'rgb(1, 3, 10)' },
  });
});

for (const [colorScheme, userBackground, assistantBackground] of [
  ['light', 'rgb(246, 247, 249)', 'rgb(246, 247, 249)'],
  ['dark', 'rgb(217, 221, 226)', 'rgb(3, 7, 18)'],
] as const) {
  test.describe(`on a ${colorScheme} operating system outside the admin`, () => {
    test.use({ colorScheme });

    test('colors code blocks from the system theme', async ({ page }) => {
      await page.goto('/theme-check/system');

      await expectBackground(page.getByTestId('theme-check-user-code'), userBackground);
      await expectBackground(page.getByTestId('theme-check-assistant-code'), assistantBackground);
    });
  });
}

const surroundingColor = 'rgb(10, 120, 60)';
const linkBlue = 'rgb(0, 0, 238)';

const anchorTestIds = [
  'button-default-link',
  'button-outline-link',
  'button-ghost-link',
  'button-destructive-link',
  'tab-link',
  'tab-active-link',
  'toggle-link',
  'toggle-on-link',
  'accordion-link',
  'select-link',
];

function resolveColor(container: Locator, value: string) {
  return container.evaluate((element, color) => {
    const probe = document.createElement('span');

    probe.style.color = color;
    element.appendChild(probe);

    const resolved = getComputedStyle(probe).color;

    probe.remove();

    return resolved;
  }, value);
}

function readLinkStyle(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);

    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
      opacity: style.opacity,
      textDecorationLine: style.textDecorationLine,
    };
  });
}

function readParentColor(locator: Locator) {
  return locator.evaluate((element) => getComputedStyle(element.parentElement!).color);
}

async function settleAnimations(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished),
    ),
  );
}

async function hoverAndRead(page: Page, locator: Locator) {
  await locator.hover();
  await settleAnimations(page);

  return readLinkStyle(locator);
}

async function openLinkMenu(page: Page) {
  await page.getByTestId('menu-trigger').click();
  await expect(page.getByTestId('menu-link')).toBeVisible();
  await settleAnimations(page);
}

async function openLinkContextMenu(page: Page) {
  await page.getByTestId('context-trigger').click({ button: 'right' });
  await expect(page.getByTestId('context-link')).toBeVisible();
  await settleAnimations(page);
}

async function openAccountMenu(page: Page, theme: AdminTheme) {
  await openPostCreate(page, theme);
  await page.locator('button[aria-label="Account"]').click();

  const settings = page.locator('.frogbot-account-menu__item', { hasText: 'Settings' });
  const logout = page.getByTestId('link-probe-logout');

  await expect(logout).toBeVisible();
  await settleAnimations(page);

  return { logout, settings };
}

test.describe('asChild links', () => {
  test.describe('outside the admin', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/theme-check/links');
      await expect(page.getByTestId('link-check')).toBeVisible();
    });

    test('asChild anchors have no underline at rest or on hover', async ({ page }) => {
      const anchors = [
        ...anchorTestIds.map((id) => page.getByTestId(id)),
        page.getByTestId('file-part').locator('a'),
      ];

      for (const anchor of anchors) {
        expect((await readLinkStyle(anchor)).textDecorationLine).toBe('none');
        expect((await hoverAndRead(page, anchor)).textDecorationLine).toBe('none');
      }

      await openLinkMenu(page);

      const menuLink = page.getByTestId('menu-link');

      expect((await readLinkStyle(menuLink)).textDecorationLine).toBe('none');
      expect((await hoverAndRead(page, menuLink)).textDecorationLine).toBe('none');

      await page.keyboard.press('Escape');
      await openLinkContextMenu(page);

      const contextLink = page.getByTestId('context-link');

      expect((await readLinkStyle(contextLink)).textDecorationLine).toBe('none');
      expect((await hoverAndRead(page, contextLink)).textDecorationLine).toBe('none');

      const contextCheckLink = page.getByTestId('context-check-link');

      expect((await readLinkStyle(contextCheckLink)).textDecorationLine).toBe('none');
      expect((await hoverAndRead(page, contextCheckLink)).textDecorationLine).toBe('none');

      const contextSubLink = page.getByTestId('context-sub-link');

      expect((await readLinkStyle(contextSubLink)).textDecorationLine).toBe('none');
      expect((await hoverAndRead(page, contextSubLink)).textDecorationLine).toBe('none');
    });

    test('a focused asChild anchor has no underline', async ({ page }) => {
      for (const id of ['button-outline-link', 'tab-link']) {
        const anchor = page.getByTestId(id);

        await anchor.focus();
        await expect(anchor).toBeFocused();

        expect((await readLinkStyle(anchor)).textDecorationLine).toBe('none');
      }
    });

    test('asChild anchors match the normal element color', async ({ page }) => {
      for (const name of [
        'button-default',
        'button-outline',
        'button-ghost',
        'button-destructive',
        'tab',
        'tab-active',
        'toggle',
        'toggle-on',
        'accordion',
        'select',
      ]) {
        const button = await readLinkStyle(page.getByTestId(`${name}-button`));
        const link = await readLinkStyle(page.getByTestId(`${name}-link`));

        expect(link.color, name).toBe(button.color);
        expect(link.color, name).not.toBe(linkBlue);
      }

      const outline = page.getByTestId('button-outline-link');
      const tab = page.getByTestId('tab-link');
      const filePart = page.getByTestId('file-part').locator('a');

      expect((await readLinkStyle(outline)).color).toBe(surroundingColor);
      expect((await readLinkStyle(tab)).color).toBe(await readParentColor(tab));
      expect((await readLinkStyle(filePart)).color).not.toBe(linkBlue);
    });

    test('asChild menu links match their div neighbours at rest', async ({ page }) => {
      await openLinkMenu(page);

      const menuDiv = await readLinkStyle(page.getByTestId('menu-div'));
      const menuLink = await readLinkStyle(page.getByTestId('menu-link'));

      expect(menuLink.color).toBe(menuDiv.color);
      expect(menuLink.color).toBe(await readParentColor(page.getByTestId('menu-link')));

      await page.keyboard.press('Escape');
      await openLinkContextMenu(page);

      const contextDiv = await readLinkStyle(page.getByTestId('context-div'));
      const contextLink = await readLinkStyle(page.getByTestId('context-link'));

      expect(contextLink.color).toBe(contextDiv.color);
      expect(contextLink.color).toBe(await readParentColor(page.getByTestId('context-link')));

      const contextCheckDiv = await readLinkStyle(page.getByTestId('context-check-div'));
      const contextCheckLink = await readLinkStyle(page.getByTestId('context-check-link'));

      expect(contextCheckLink.color).toBe(contextCheckDiv.color);

      const contextSubDiv = await readLinkStyle(page.getByTestId('context-sub-div'));
      const contextSubLink = await readLinkStyle(page.getByTestId('context-sub-link'));

      expect(contextSubLink.color).toBe(contextSubDiv.color);
    });

    test('asChild menu links match their div neighbours when highlighted', async ({ page }) => {
      await openLinkMenu(page);

      const menuDiv = await hoverAndRead(page, page.getByTestId('menu-div'));
      const menuLink = await hoverAndRead(page, page.getByTestId('menu-link'));

      expect(menuLink.color).toBe(menuDiv.color);
      expect(menuLink.backgroundColor).toBe(menuDiv.backgroundColor);
      expect(menuLink.textDecorationLine).toBe('none');

      await page.keyboard.press('Escape');
      await openLinkContextMenu(page);

      const contextDiv = await hoverAndRead(page, page.getByTestId('context-div'));
      const contextLink = await hoverAndRead(page, page.getByTestId('context-link'));

      expect(contextLink.color).toBe(contextDiv.color);
      expect(contextLink.backgroundColor).toBe(contextDiv.backgroundColor);
      expect(contextLink.textDecorationLine).toBe('none');

      const contextCheckDiv = await hoverAndRead(page, page.getByTestId('context-check-div'));
      const contextCheckLink = await hoverAndRead(page, page.getByTestId('context-check-link'));

      expect(contextCheckLink.color).toBe(contextCheckDiv.color);
      expect(contextCheckLink.backgroundColor).toBe(contextCheckDiv.backgroundColor);
      expect(contextCheckLink.textDecorationLine).toBe('none');

      const contextSubDiv = await hoverAndRead(page, page.getByTestId('context-sub-div'));
      const contextSubLink = await hoverAndRead(page, page.getByTestId('context-sub-link'));

      expect(contextSubLink.color).toBe(contextSubDiv.color);
      expect(contextSubLink.backgroundColor).toBe(contextSubDiv.backgroundColor);
      expect(contextSubLink.textDecorationLine).toBe('none');
    });

    test('Button variant="link" underlines on hover only, as a button and as a link', async ({
      page,
    }) => {
      for (const id of ['button-link-button', 'button-link-link']) {
        const element = page.getByTestId(id);

        expect((await readLinkStyle(element)).textDecorationLine, id).toBe('none');
        expect((await hoverAndRead(page, element)).textDecorationLine, id).toBe('underline');
      }
    });

    test('Button variant="link" keeps its 4px underline offset on hover', async ({ page }) => {
      for (const id of ['button-link-button', 'button-link-link']) {
        const element = page.getByTestId(id);

        await element.hover();

        const offset = await element.evaluate((node) => getComputedStyle(node).textUnderlineOffset);

        expect(offset, id).toBe('4px');
      }
    });

    test('variant and state colors still win over the base color: inherit', async ({ page }) => {
      const container = page.getByTestId('link-check');
      const expectColor = async (id: string, value: string) =>
        expect((await readLinkStyle(page.getByTestId(id))).color, id).toBe(
          await resolveColor(container, value),
        );

      for (const suffix of ['button', 'link']) {
        await expectColor(`button-ghost-${suffix}`, 'var(--theme-base-700)');
        await expectColor(`button-destructive-${suffix}`, 'var(--color-base-900)');
        await expectColor(`tab-active-${suffix}`, 'var(--theme-base-900)');
        await expectColor(`toggle-on-${suffix}`, 'var(--theme-base-1000)');
      }

      for (const suffix of ['button', 'link']) {
        const ghost = page.getByTestId(`button-ghost-${suffix}`);

        expect((await hoverAndRead(page, ghost)).color, `ghost ${suffix} hover`).toBe(
          await resolveColor(container, 'var(--theme-base-1000)'),
        );

        const destructive = page.getByTestId(`button-destructive-${suffix}`);

        expect((await hoverAndRead(page, destructive)).color, `destructive ${suffix} hover`).toBe(
          await resolveColor(container, 'var(--color-base-900)'),
        );

        const toggle = page.getByTestId(`toggle-${suffix}`);

        expect((await hoverAndRead(page, toggle)).color, `toggle ${suffix} hover`).toBe(
          await resolveColor(container, 'var(--theme-base-1000)'),
        );
      }
    });

    test('a highlighted asChild menu link takes the highlighted item color', async ({ page }) => {
      await openLinkMenu(page);

      const menuLink = page.getByTestId('menu-link');
      const highlighted = await hoverAndRead(page, menuLink);
      const content = page.locator('.fb-dropdown-menu__content');

      expect(highlighted.color).toBe(await resolveColor(content, 'var(--theme-base-800)'));
      expect(highlighted.color).not.toBe(await readParentColor(menuLink));
    });
  });

  test.describe('in the admin', () => {
    for (const theme of ['light', 'dark'] as const) {
      test(`a custom logout.Button link matches the built-in Settings item in the ${theme} admin`, async ({
        page,
      }) => {
        const { logout, settings } = await openAccountMenu(page, theme);

        const settingsAtRest = await readLinkStyle(settings);
        const logoutAtRest = await readLinkStyle(logout);

        expect(logoutAtRest.color).toBe(settingsAtRest.color);
        expect(logoutAtRest.textDecorationLine).toBe('none');

        const settingsHovered = await hoverAndRead(page, settings);
        const logoutHovered = await hoverAndRead(page, logout);

        expect(logoutHovered.color).toBe(settingsHovered.color);
        expect(logoutHovered.backgroundColor).toBe(settingsHovered.backgroundColor);
        expect(logoutHovered.textDecorationLine).toBe('none');
      });

      test(`a hovered asChild logout item is as opaque as the hovered Settings item in the ${theme} admin`, async ({
        page,
      }) => {
        const { logout, settings } = await openAccountMenu(page, theme);

        const settingsHovered = await hoverAndRead(page, settings);
        const logoutHovered = await hoverAndRead(page, logout);

        const logoutFocused = await logout.evaluate(
          (element) => document.activeElement === element,
        );

        expect(logoutFocused).toBe(true);
        expect(logoutHovered.opacity).toBe(settingsHovered.opacity);
      });
    }

    test('the issue workaround CSS left in place changes nothing', async ({ page }) => {
      const { logout, settings } = await openAccountMenu(page, 'light');
      const before = [await readLinkStyle(logout), await readLinkStyle(settings)];

      await page.addStyleTag({
        content: '.fb-button, a.fb-dropdown-menu__item { text-decoration: none; }',
      });

      expect([await readLinkStyle(logout), await readLinkStyle(settings)]).toEqual(before);

      const settingsHovered = await hoverAndRead(page, settings);
      const logoutHovered = await hoverAndRead(page, logout);

      expect(logoutHovered.color).toBe(settingsHovered.color);
      expect(logoutHovered.backgroundColor).toBe(settingsHovered.backgroundColor);
      expect(logoutHovered.textDecorationLine).toBe('none');
    });
  });

  test.describe('signed out', () => {
    test.use({ storageState: signedOut });

    test('a beforeLogin asChild Button link has no underline and matches the normal button', async ({
      page,
    }) => {
      await page.goto('/login');

      const link = page.getByTestId('login-link-probe');

      await expect(link).toBeVisible();

      const linkStyle = await readLinkStyle(link);
      const buttonStyle = await readLinkStyle(page.getByTestId('login-button-probe'));

      expect(linkStyle.textDecorationLine).toBe('none');
      expect(linkStyle.color).toBe(buttonStyle.color);
    });
  });
});
