import { expect, type Page, test } from '@playwright/test';

import { openPostCreate, readAdminColor } from './__helpers/adminTheme';
import { contrast, flatten } from './__helpers/color';

function tokenIn(page: Page, token: string, parent = '<div data-leaf></div>') {
  return page.evaluate(
    ({ token, parent }) => {
      const host = document.createElement('div');

      host.innerHTML = parent;
      document.body.append(host);

      const leaf = host.querySelector('[data-leaf]') ?? host.firstElementChild!;
      const probe = document.createElement('span');

      probe.style.backgroundColor = `var(${token})`;
      leaf.append(probe);

      const value = getComputedStyle(probe).backgroundColor;

      host.remove();

      return value;
    },
    { token, parent },
  );
}

function rgb(color: string) {
  const srgb = color.match(/^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)/);

  if (srgb) return srgb.slice(1, 4).map((channel) => Math.round(Number(channel) * 255));

  const match = color.match(/rgba?\((\d+), (\d+), (\d+)/);

  expect(match, color).not.toBeNull();

  return match!.slice(1, 4).map(Number);
}

const payloadDarkPopup = '<div class="popup__content" data-theme="dark" data-leaf></div>';

for (const theme of ['light', 'dark'] as const) {
  test(`Payload's default dark popup stays readable in the ${theme} admin`, async ({ page }) => {
    await openPostCreate(page, theme);

    const shown = await page.evaluate((markup) => {
      const host = document.createElement('div');

      host.innerHTML = markup;
      host.firstElementChild!.textContent = 'Duplicate';
      (host.firstElementChild as HTMLElement).style.position = 'static';
      document.body.append(host);

      const style = getComputedStyle(host.firstElementChild!);
      const result = { text: style.color, background: style.backgroundColor };

      host.remove();

      return result;
    }, payloadDarkPopup);

    expect
      .soft(contrast(shown), `popup text ${shown.text} on ${shown.background}`)
      .toBeGreaterThanOrEqual(4.5);

    const row = await page.evaluate((markup) => {
      const host = document.createElement('div');

      host.innerHTML = markup;
      document.body.append(host);

      const probe = document.createElement('span');

      probe.className = 'user-menu__submenu-header-row';
      probe.style.color = 'var(--popup-item-color-hover, var(--color-text-onselected-strong))';
      probe.style.backgroundColor = 'var(--color-bg-transparent-hover)';
      host.firstElementChild!.append(probe);

      const style = getComputedStyle(probe);
      const result = { text: style.color, background: style.backgroundColor };

      host.remove();

      return result;
    }, payloadDarkPopup);

    expect(
      contrast({ text: row.text, background: flatten(row.background, shown.background) }),
      `hovered row text ${row.text} on ${row.background} over ${shown.background}`,
    ).toBeGreaterThanOrEqual(4.5);
  });
}

test("a role set on :root reaches Payload's dark popups and toasts", async ({ page }) => {
  await openPostCreate(page, 'light');
  await page.addStyleTag({ content: ':root { --primary: rgb(37, 99, 235); }' });

  const blue = 'rgb(37, 99, 235)';

  expect(await tokenIn(page, '--color-bg-brand'), 'page').toBe(blue);
  expect
    .soft(
      await tokenIn(page, '--color-bg-selected-strong', payloadDarkPopup),
      'popup item hover fill (popup-button-list__button:hover, rs__option--is-focused)',
    )
    .toBe(blue);
  expect(
    await tokenIn(
      page,
      '--color-bg-success',
      '<ol data-sonner-toaster data-theme="dark" class="payload-toast-container"><li data-leaf></li></ol>',
    ),
    'success toast icon (.icon--success .icon__circle)',
  ).toBe(blue);
});

test("the docs' blue theme leaves no green on primary hover and pressed", async ({ page }) => {
  await openPostCreate(page, 'light');

  await page.addStyleTag({
    content: `:root { --blue-400: #60a5fa; --primary: var(--blue-400); --primary-hover: var(--blue-300); --primary-pressed: var(--blue-500); --primary-foreground: var(--neutral-950); --brand: var(--blue-700); }
[data-theme='dark'] { --brand: var(--blue-400); }`,
  });

  for (const token of ['--color-bg-brand', '--color-bg-brand-hover', '--color-bg-brand-pressed']) {
    const [r, g, b] = rgb(await readAdminColor(page, token));

    expect(b, `${token} is rgb(${r}, ${g}, ${b}): blue should dominate, not green`).toBeGreaterThan(
      g,
    );
  }
});

test('an app --radius and --text-sm reach FrogBot components', async ({ page }) => {
  await page.goto('/theme-check/system');

  const code = page.getByTestId('theme-check-user-code');

  await expect(code).toBeVisible();
  await page.addStyleTag({ content: ':root { --radius: 0px; --text-sm: 1rem; }' });

  await expect(code, '.fb-code-block radius (var(--fb-radius-lg))').toHaveCSS(
    'border-radius',
    '0px',
  );
  await expect(page.locator('.fb-theme').first(), 'FrogBot body text').toHaveCSS(
    'font-size',
    '16px',
  );
});

test("Payload's high-contrast mode still raises secondary text and control borders", async ({
  page,
}) => {
  await openPostCreate(page, 'light');

  const tokens = ['--color-text-secondary', '--color-text-tertiary', '--color-border-control'];
  const before = await Promise.all(tokens.map((token) => readAdminColor(page, token)));

  await page.evaluate(() => document.documentElement.setAttribute('data-enhanced-contrast', ''));

  const after = await Promise.all(tokens.map((token) => readAdminColor(page, token)));

  tokens.forEach((token, index) => {
    expect(after[index], `${token} with high contrast (was ${before[index]})`).not.toBe(
      before[index],
    );
  });
});

test('Tailwind pages keep JetBrains Mono as the FrogBot code font', async ({ page }) => {
  await page.goto('/tw/frogbot-first');
  const font = await page.evaluate(() => {
    const element = document.createElement('div');

    element.dataset.fbUi = '';
    document.body.append(element);

    const value = getComputedStyle(element).getPropertyValue('--fb-font-mono');

    element.remove();

    return value;
  });

  expect(font).toMatch(/^"JetBrains Mono"/);
});

test('dark primary roles set on [data-theme=dark] reach brand fills in a dark section', async ({
  page,
}) => {
  await openPostCreate(page, 'light');

  await page.addStyleTag({
    content: `[data-theme='dark'] { --primary: rgb(37, 99, 235); --primary-hover: rgb(96, 165, 250); --primary-pressed: rgb(29, 78, 216); }`,
  });

  const section = '<div data-theme="dark" data-leaf></div>';

  expect(await tokenIn(page, '--color-bg-brand', section)).toBe('rgb(37, 99, 235)');
  expect(await tokenIn(page, '--color-bg-brand-hover', section)).toBe('rgb(96, 165, 250)');
  expect(await tokenIn(page, '--color-bg-brand-pressed', section)).toBe('rgb(29, 78, 216)');
});

test("the admin's body line height stays a length when Tailwind's theme sets --text-sm--line-height", async ({
  page,
}) => {
  await openPostCreate(page, 'light');

  await page.addStyleTag({
    content:
      '@layer theme { :root, :host { --text-sm: 0.875rem; --text-sm--line-height: calc(1.25 / 0.875); } }',
  });

  const height = await page.evaluate(() => {
    const probe = document.createElement('div');

    probe.style.height = 'calc(var(--text-body-medium-line-height) + 0px)';
    document.body.append(probe);

    const value = getComputedStyle(probe).height;

    probe.remove();

    return value;
  });

  expect(height).toBe('20px');
});

test("an app's --popup-item-color-hover on the menu still reaches the user menu's brand row", async ({
  page,
}) => {
  await openPostCreate(page, 'light');

  await page.addStyleTag({
    content:
      '.app-menu { --popup-item-bg-hover: rgb(37, 99, 235); --popup-item-color-hover: rgb(255, 255, 255); }',
  });

  const row = await page.evaluate(() => {
    const host = document.createElement('div');

    host.innerHTML =
      '<div class="app-menu popup__content"><button class="user-menu__submenu-header-row">Acme</button></div>';

    document.body.append(host);

    const button = host.querySelector('button')!;

    button.style.color = 'var(--popup-item-color-hover, var(--color-text-onselected-strong))';
    button.style.backgroundColor = 'var(--popup-item-bg-hover, var(--color-bg-transparent-hover))';

    const style = getComputedStyle(button);
    const result = { text: style.color, background: style.backgroundColor };

    host.remove();

    return result;
  });

  expect(row.background).toBe('rgb(37, 99, 235)');
  expect(row.text).toBe('rgb(255, 255, 255)');
});
