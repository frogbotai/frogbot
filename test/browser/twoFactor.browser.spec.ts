import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { type APIRequestContext, expect, type Page, test } from '@playwright/test';
import { Secret, TOTP } from 'otpauth';

import { registerFirstUser, user } from './__helpers/signIn';

const password = 'two-factor-browser-password';

const shots = path.join(path.dirname(fileURLToPath(import.meta.url)), 'test-results', 'two-factor');

let consoleErrors: string[];

const code = (secret: string, offset = 0) =>
  new TOTP({ secret: Secret.fromBase32(secret) }).generate({ timestamp: Date.now() + offset });

async function token(request: APIRequestContext, data: { email: string; password: string }) {
  const response = await request.post('/api/users/login', { data });
  const body = (await response.json()) as { token?: string };

  expect(body.token, `login for ${data.email}`).toEqual(expect.any(String));

  return { authorization: `JWT ${body.token}` };
}

async function createUser(request: APIRequestContext, email: string) {
  await registerFirstUser(request);

  const created = await request.post('/api/users', {
    data: { email, password },
    headers: await token(request, user),
  });

  expect(created.ok()).toBe(true);

  return ((await created.json()) as { doc: { id: string | number } }).doc.id;
}

async function turnOn(request: APIRequestContext, email: string) {
  const headers = await token(request, { email, password });
  const started = await request.post('/api/users/two-factor/enable/start', { headers });
  const { secret } = (await started.json()) as { secret: string };
  const enabled = await request.post('/api/users/two-factor/enable', {
    data: { code: code(secret) },
    headers,
  });

  expect(enabled.ok()).toBe(true);

  return {
    secret,
    recoveryCodes: ((await enabled.json()) as { recoveryCodes: string[] }).recoveryCodes,
  };
}

async function submitPassword(page: Page, email: string, value = password) {
  const form = page.locator('form.login__form');

  await expect
    .poll(() =>
      form.evaluate((element) => Object.keys(element).some((key) => key.startsWith('__react'))),
    )
    .toBe(true);

  await form.locator('input[name="email"]').fill(email);
  await form.locator('input[name="password"]').fill(value);
  await form.locator('button[type="submit"]').click();
}

test.beforeEach(({ page }) => {
  consoleErrors = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  page.on('pageerror', (error) => consoleErrors.push(error.message));
});

test.afterEach(() => {
  expect(consoleErrors).toEqual([]);
});

test('signs in through the admin password form and the code page', async ({ page, request }) => {
  const email = `code-${Date.now()}@example.com`;

  await createUser(request, email);

  const { secret } = await turnOn(request, email);

  await page.goto('/login?redirect=%2Fcollections%2Fusers');
  await expect(page.locator('.login__brand')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue with Stub' })).toBeVisible();

  await submitPassword(page, email, 'not-the-password');
  await expect(page.getByText('The email or password provided is incorrect.')).toBeVisible();
  consoleErrors = consoleErrors.filter((message) => !message.includes('status of 401'));

  await submitPassword(page, email);
  await page.waitForURL((url) => url.pathname === '/api/users/two-factor');
  await expect(page.getByRole('heading')).toBeVisible();

  await page.getByLabel('Code').fill(code(secret, 30_000));
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.waitForURL((url) => url.pathname === '/collections/users');
  await expect(page.locator('.fb-nav-shell')).toBeVisible();

  const me = await page.evaluate(async () => (await fetch('/api/users/me')).json());

  expect(me.user?.email).toBe(email);
});

test('turns two-factor sign-in on and off from the account section', async ({ page, request }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

  const email = `account-${Date.now()}@example.com`;
  const id = await createUser(request, email);

  await page.goto('/login');
  await submitPassword(page, email);
  await page.waitForURL((url) => url.pathname === '/');

  await page.goto(`/collections/users/${id}`);

  const section = page.locator('section.two-factor');

  await expect(section.getByText('Off', { exact: true })).toBeVisible();
  await expect(section.getByText("API keys aren't affected")).toBeVisible();

  await section.getByRole('button', { name: 'Turn on' }).click();

  const dialog = page.getByRole('dialog');

  await expect(dialog.getByAltText('QR code for your authenticator app')).toBeVisible();

  const secret = (await dialog.locator('.two-factor__key').textContent())!;

  await dialog.getByLabel('6-digit code').fill(code(secret));
  await dialog.getByRole('button', { name: 'Turn on' }).click();

  const codes = dialog.getByRole('list', { name: 'Recovery codes' }).getByRole('listitem');

  await expect(codes).toHaveCount(10);

  const recovery = (await codes.first().textContent())!;

  await dialog.getByRole('button', { name: 'Copy' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(recovery);

  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(section.getByText('On', { exact: true })).toBeVisible();

  await section.getByRole('button', { name: 'Turn off' }).click();
  await dialog.getByLabel('Code or recovery code').fill(recovery);
  await dialog.getByRole('button', { name: 'Turn off' }).click();

  await expect(section.getByText('Off', { exact: true })).toBeVisible();
  await expect(section.getByRole('button', { name: 'Turn on' })).toBeVisible();
});

async function shoot(page: Page, name: string) {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: path.join(shots, `${name}-${width}.png`), fullPage: true });
  }
}

const style = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const { backgroundColor, color, height, fontSize } = getComputedStyle(element);

      return { backgroundColor, color, height, fontSize };
    });

for (const theme of ['light', 'dark'] as const) {
  const background = theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(9, 14, 27)';

  test(`renders the code, recovery and expired pages in the ${theme} admin theme`, async ({
    page,
    request,
  }) => {
    const email = `look-${theme}-${Date.now()}@example.com`;

    await createUser(request, email);

    const { recoveryCodes } = await turnOn(request, email);

    await page
      .context()
      .addCookies([{ name: 'frogbot-theme', value: theme, domain: 'localhost', path: '/' }]);

    await page.goto('/login');
    await submitPassword(page, email);
    await page.waitForURL((url) => url.pathname === '/api/users/two-factor');

    expect((await style(page, 'html')).backgroundColor).toBe(background);
    expect(await style(page, 'h1')).toMatchObject({ fontSize: '24px' });
    expect(await style(page, 'button')).toEqual({
      backgroundColor: 'rgb(58, 207, 106)',
      color: 'rgb(4, 33, 13)',
      height: '32px',
      fontSize: '14px',
    });
    expect((await style(page, 'input')).height).toBe('32px');
    await shoot(page, `code-${theme}`);

    await page.getByLabel('Code').fill('000000');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('alert')).toHaveText("That code didn't work.");
    consoleErrors = consoleErrors.filter((message) => !message.includes('status of 401'));
    await shoot(page, `code-error-${theme}`);

    await page.getByLabel('Code').fill(recoveryCodes[0]);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('9 recovery codes left.')).toBeVisible();
    await shoot(page, `recovery-left-${theme}`);

    await page.getByRole('link', { name: 'Continue' }).click();
    await page.waitForURL((url) => url.pathname === '/');
    await expect(page.locator('.fb-nav-shell')).toBeVisible();

    await page.context().clearCookies({ name: 'frogbot-token' });
    await page.goto('/api/users/two-factor');
    consoleErrors = consoleErrors.filter((message) => !message.includes('status of 400'));
    await expect(page.getByRole('heading', { name: 'Sign in again' })).toBeVisible();
    await shoot(page, `expired-${theme}`);
  });

  test(`renders the setup and saved-codes pages in the ${theme} admin theme`, async ({
    page,
    request,
  }) => {
    const email = `required-${theme}-${Date.now()}@example.com`;

    await createUser(request, email);

    await page
      .context()
      .addCookies([{ name: 'frogbot-theme', value: theme, domain: 'localhost', path: '/' }]);

    await page.goto('/login');
    await submitPassword(page, email);
    await page.waitForURL((url) => url.pathname === '/api/users/two-factor');

    await expect(page.getByAltText('QR code for your authenticator app')).toBeVisible();
    expect((await style(page, 'html')).backgroundColor).toBe(background);
    await shoot(page, `setup-${theme}`);

    const secret = (await page.locator('code').textContent())!;

    await page.getByLabel('Code').fill(code(secret));
    await page.getByRole('button', { name: 'Turn on' }).click();
    await expect(page.getByRole('listitem')).toHaveCount(10);
    await shoot(page, `recovery-codes-${theme}`);

    await page.getByRole('button', { name: 'I saved my codes' }).click();
    await page.waitForURL((url) => url.pathname === '/');
  });
}
