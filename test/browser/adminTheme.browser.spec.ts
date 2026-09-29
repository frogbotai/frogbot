import { expect, type Locator, type Page, test } from '@playwright/test';

type AdminTheme = 'dark' | 'light';

const user = { email: 'custom-field@example.com', password: 'browser-test-password' };

async function signIn(page: Page) {
  await page.goto('/');
  await page.waitForURL(/\/(create-first-user|login)/);
  await page.waitForLoadState('networkidle');
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', user.password);

  if (page.url().includes('create-first-user')) {
    const response = await page.request.post('/api/users/first-register', { data: user });

    expect(response.ok()).toBe(true);
    await page.goto('/');

    return;
  }

  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !/\/(create-first-user|login)/.test(url.pathname));
}

async function openPostCreate(page: Page, theme: AdminTheme) {
  await page
    .context()
    .addCookies([{ name: 'frogbot-theme', value: theme, domain: 'localhost', path: '/' }]);

  await page.goto('/collections/posts/create');
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function readAdminColor(page: Page, token: string) {
  return page.evaluate((name) => {
    const sample = document.createElement('div');

    sample.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue(
      name,
    );
    document.body.append(sample);

    const color = getComputedStyle(sample).backgroundColor;

    sample.remove();

    return color;
  }, token);
}

function readBackground(locator: Locator) {
  return locator.evaluate((element) => getComputedStyle(element).backgroundColor);
}

function readAdminStyles(page: Page) {
  return page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);

    return {
      base0: root.getPropertyValue('--color-base-0'),
      base500: root.getPropertyValue('--color-base-500'),
      base1000: root.getPropertyValue('--color-base-1000'),
      fontBody: root.getPropertyValue('--font-body'),
      bodyBackground: body.backgroundColor,
      bodyColor: body.color,
      bodyFont: body.fontFamily,
    };
  });
}

async function openMenu(page: Page, prefix: string) {
  await page.getByTestId(`${prefix}-trigger`).first().click();

  const menu = page.getByTestId(prefix);

  await expect(menu).toBeVisible();

  return menu;
}

async function expectBackground(locator: Locator, expected: string) {
  expect(expected).not.toBe('rgba(0, 0, 0, 0)');
  await expect.poll(() => readBackground(locator)).toBe(expected);
}

test.describe('FrogBot UI in the admin', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

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

  for (const theme of ['light', 'dark'] as const) {
    test(`leaves the ${theme} admin's own styles unchanged`, async ({ page }) => {
      await openPostCreate(page, theme);
      await expect(page.locator('html')).toHaveAttribute('data-fb-ui-page', '');
      await expect(page.getByTestId('theme-probe-default').first()).toBeVisible();

      const withMarker = await readAdminStyles(page);

      expect(withMarker.base0).not.toBe('');
      expect(withMarker.fontBody).not.toBe('');

      await page.evaluate(() => document.documentElement.removeAttribute('data-fb-ui-page'));

      expect(
        await page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--theme-base-0'),
        ),
      ).toBe('');
      expect(await readAdminStyles(page)).toEqual(withMarker);
    });
  }

  test('resolves portal colors to the admin palette', async ({ page }) => {
    await openPostCreate(page, 'light');

    const menu = await openMenu(page, 'theme-probe-menu');
    const portalBase0 = await menu.evaluate((element) =>
      getComputedStyle(element.closest('.fb-portal')!).getPropertyValue('--color-base-0'),
    );

    expect(portalBase0).not.toBe('');
    expect(portalBase0).toBe((await readAdminStyles(page)).base0);
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
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--theme-base-0'),
    ),
  ).toBe('');
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
